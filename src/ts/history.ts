import { colorKey } from "./overlay";
import type { CellChanges, CellMap, LegendChanges, LegendMap, OverlayEdit } from "./types";

// receiver that writes an edit to the scene
export interface EditTarget {
  apply(edit: OverlayEdit): Promise<boolean>;
}

// command pattern; each instance is one undo step
export interface OverlayCommand {
  execute(target: EditTarget): Promise<boolean>;
  undo(target: EditTarget): Promise<boolean>;
}

// a stroke, line, rectangle or reset; before holds the prior cell values
export class PaintCommand implements OverlayCommand {
  constructor(
    readonly before: CellChanges,
    readonly after: CellChanges,
  ) {}

  // drops cells the stroke didn't change; null when nothing is left
  static from(saved: CellChanges, changes: CellChanges): PaintCommand | null {
    const before: CellChanges = {};
    const after: CellChanges = {};
    for (const [key, color] of Object.entries(changes)) {
      const prior = saved[key] ?? null;
      if (prior === color) continue;
      before[key] = prior;
      after[key] = color;
    }
    return Object.keys(after).length ? new PaintCommand(before, after) : null;
  }

  execute(target: EditTarget): Promise<boolean> {
    return target.apply({ cells: this.after });
  }

  undo(target: EditTarget): Promise<boolean> {
    return target.apply({ cells: this.before });
  }
}

// swaps every cell of one color and moves its legend name along
export class RecolorCommand implements OverlayCommand {
  readonly #keys: string[];
  readonly #name: string | undefined;

  constructor(
    cells: CellMap,
    legend: LegendMap,
    readonly from: string,
    readonly to: string,
  ) {
    this.#keys = Object.keys(cells).filter((k) => colorKey(cells[k]) === colorKey(from));
    this.#name = legend[colorKey(from)]?.name;
  }

  #edit(from: string, to: string): OverlayEdit {
    const cells = Object.fromEntries(this.#keys.map((k) => [k, to]));
    const legend: LegendChanges = {};
    if (this.#name) {
      legend[colorKey(from)] = null;
      legend[colorKey(to)] = this.#name;
    }
    return { cells, legend };
  }

  execute(target: EditTarget): Promise<boolean> {
    return target.apply(this.#edit(this.from, this.to));
  }

  undo(target: EditTarget): Promise<boolean> {
    return target.apply(this.#edit(this.to, this.from));
  }
}

// per-client undo and redo stacks for the viewed scene
export class CommandHistory {
  static readonly LIMIT = 100;

  #undo: OverlayCommand[] = [];
  #redo: OverlayCommand[] = [];
  // promise chain runs commands one at a time
  #queue: Promise<unknown> = Promise.resolve();

  constructor(readonly target: EditTarget) {}

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  clear(): void {
    this.#undo = [];
    this.#redo = [];
  }

  execute(command: OverlayCommand): Promise<boolean> {
    return this.#enqueue(async () => {
      if (!(await command.execute(this.target))) return false;
      this.#undo.push(command);
      if (this.#undo.length > CommandHistory.LIMIT) this.#undo.shift();
      this.#redo = [];
      return true;
    });
  }

  undo(): Promise<boolean> {
    return this.#enqueue(async () => {
      const command = this.#undo.pop();
      if (!command) return false;
      if (!(await command.undo(this.target))) {
        this.#undo.push(command);
        return false;
      }
      this.#redo.push(command);
      return true;
    });
  }

  redo(): Promise<boolean> {
    return this.#enqueue(async () => {
      const command = this.#redo.pop();
      if (!command) return false;
      if (!(await command.execute(this.target))) {
        this.#redo.push(command);
        return false;
      }
      this.#undo.push(command);
      return true;
    });
  }

  #enqueue(run: () => Promise<boolean>): Promise<boolean> {
    const next = this.#queue.then(run);
    this.#queue = next.catch(() => undefined);
    return next;
  }
}
