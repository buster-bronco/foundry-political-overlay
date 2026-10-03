import LegendWindow from "../apps/LegendWindow";
import PaletteControls from "../apps/PaletteControls";
import { CONSTANTS } from "../constants";
import { CommandHistory, PaintCommand, RecolorCommand, type EditTarget } from "../history";
import { cellStep, curveAt, findBlobs, layoutLabel, type LabelLayout } from "../labels";
import { commitChanges, getAlpha, getCells, getFlags, getLabelOptions, getLegend } from "../overlay";
import { getLabelFont, getPaletteColor, isLightRequired } from "../settings";
import type { CellChanges, CellMap, OverlayEdit, OverlayTool } from "../types";
import { getGame, isGM } from "../utils";

const { InteractionLayer } = foundry.canvas.layers;

// one territory name; worldlength drives the min width check
type LabelContainer = PIXI.Container & { worldLength: number; zoom: number };

// registered under the interface canvas group; lives at canvas.politicalOverlay
export default class PoliticalOverlayLayer extends InteractionLayer implements EditTarget {
  tool: OverlayTool = "paint";

  #cells!: PIXI.Graphics;
  #labels!: PIXI.Container;
  #preview!: PIXI.Graphics;
  // merged cell map from the last refresh
  #labelCells: CellMap = {};
  // debounce collapses a paint stroke into one relayout
  #rebuildLabels = foundry.utils.debounce(() => this.#buildLabels(), CONSTANTS.LABEL_REBUILD_DELAY);
  // strokes not yet echoed back through updateScene
  #pending: CellChanges = {};
  #inflight: CellChanges = {};
  // last painted cell; start point for shift-click lines
  #anchor: string | null = null;
  // canvas point where a ctrl-drag rectangle started
  #rectOrigin: PIXI.IPointData | null = null;
  // true while the middle mouse button is held
  #erasing = false;
  // cell keys a player has explored; never shrinks until a fog reset
  #seen = new Set<string>();
  // masking state at the last refresh
  #wasMasked = false;
  // this client's undoable edits on the viewed scene
  #history = new CommandHistory(this);

  static override get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: CONSTANTS.LAYER_NAME,
      zIndex: CONSTANTS.LAYER_Z_INDEX,
    } as any);
  }

  static register(): void {
    (CONFIG.Canvas.layers as any)[CONSTANTS.LAYER_NAME] = { group: "interface", layerClass: PoliticalOverlayLayer };
  }

  // _draw runs on every canvas draw, including scene switches
  protected override async _draw(options: any): Promise<void> {
    await super._draw(options);
    this.#cells = this.addChild(new PIXI.Graphics());
    this.#labels = this.addChild(new PIXI.Container());
    this.#preview = this.addChild(new PIXI.Graphics());
    this.#pending = {};
    this.#inflight = {};
    this.#anchor = null;
    this.#rectOrigin = null;
    this.#seen.clear();
    this.#history.clear();
    this.refresh();
  }

  refresh(): void {
    if (!this.#cells || !canvas?.scene) return;
    const scene = canvas.scene;
    this.#wasMasked = this.#masked;
    const all = { ...getCells(scene), ...this.#inflight, ...this.#pending };
    this.#updateSeen(all);
    const cells = this.filterSeen(all);

    // editors see a faded overlay while it's hidden from players
    const shown = !!getFlags(scene).visible;
    this.#cells.visible = shown || this.active;
    this.#cells.alpha = getAlpha(scene) * (shown ? 1 : CONSTANTS.HIDDEN_ALPHA_SCALE);
    this.#cells.clear();
    for (const [key, color] of Object.entries(cells)) {
      if (color) this.#drawCell(this.#cells, key, color);
    }

    this.#labels.visible = this.#cells.visible;
    this.#labels.alpha = shown ? 1 : CONSTANTS.HIDDEN_ALPHA_SCALE;
    this.#labelCells = cells as CellMap;
    this.#rebuildLabels();
  }

  /* -------------------------------------------- */
  /*  Vision                                      */
  /* -------------------------------------------- */

  // gm vision sources only exist for controlled tokens with sight
  get #tokenPreview(): boolean {
    return isGM() && !!canvas?.effects?.visionSources.some((s) => s.active);
  }

  // tokenvision is the scene's fog of war toggle
  get #masked(): boolean {
    return !!canvas?.visibility?.tokenVision && (!isGM() || this.#tokenPreview);
  }

  // drops cells the player hasn't explored
  filterSeen<T extends CellChanges>(cells: T): T {
    if (!this.#masked) return cells;
    return Object.fromEntries(Object.entries(cells).filter(([key]) => this.#seen.has(key))) as T;
  }

  // sightrefresh fires after token moves, light changes and token selection
  refreshVision(): void {
    if (!this.#cells || !canvas?.scene) return;
    const masked = this.#masked;
    const flipped = masked !== this.#wasMasked;
    const changed = this.#updateSeen({ ...getCells(canvas.scene), ...this.#inflight, ...this.#pending });
    if (!changed && !flipped) return;
    this.refresh();
    LegendWindow.sync();
    PaletteControls.sync();
  }

  // gm fog reset deletes the fogexploration document
  resetVision(): void {
    this.#seen.clear();
    this.refresh();
    LegendWindow.sync();
    PaletteControls.sync();
  }

  // ispointexplored reads saved fog; testvisibility is current sight
  #updateSeen(cells: CellChanges): boolean {
    const grid = canvas?.grid;
    if (!this.#masked || !grid || !canvas?.visibility) return false;
    // gm token preview is live sight only, rebuilt every refresh
    const live = this.#tokenPreview;
    const seen = live ? new Set<string>() : this.#seen;
    const fog = canvas.fog;
    const explored = !live && !!fog?.fogExploration;
    const tolerance = cellStep(grid) / 4;
    const requireLight = isLightRequired() && !!canvas.effects;
    let added = false;
    for (const key of Object.keys(cells)) {
      if (seen.has(key)) continue;
      const center = grid.getCenterPoint(this.#offset(key));
      // testinsidelight covers light sources and global illumination
      if (requireLight && !canvas.effects!.testInsideLight({ ...center, elevation: 0 })) continue;
      if (canvas.visibility.testVisibility(center, { tolerance }) || (explored && fog!.isPointExplored(center))) {
        seen.add(key);
        added = true;
      }
    }
    if (!live) return added;
    const changed = seen.size !== this.#seen.size || [...seen].some((k) => !this.#seen.has(k));
    this.#seen = seen;
    return changed;
  }

  /* -------------------------------------------- */
  /*  Labels                                      */
  /* -------------------------------------------- */

  #buildLabels(): void {
    const labels = this.#labels;
    const grid = canvas?.grid;
    if (!labels || labels.destroyed || !canvas?.scene || !grid || grid.isGridless) return;
    for (const child of labels.removeChildren()) child.destroy({ children: true });
    const options = getLabelOptions(canvas.scene);
    if (!options.enabled) return;

    const legend = getLegend(canvas.scene);
    const font = getLabelFont();
    const step = cellStep(grid);
    for (const blob of findBlobs(this.#labelCells, options.gap, grid)) {
      const name = legend[blob.key]?.name?.trim();
      if (!name) continue;
      const chars = [...name.toUpperCase()];
      const style = this.#labelStyle(font, blob.color);
      const advances = chars.map((ch) => this.#measure(ch, style) + CONSTANTS.LABEL_LETTER_SPACING);
      const layout = layoutLabel(blob, advances, step, options.gap);
      if (layout) labels.addChild(this.#drawLabel(chars, advances, layout, style));
    }
    this.updateLabels();
  }

  // dark text on light colors, light text on dark ones
  #labelStyle(font: string, color: string): PIXI.TextStyle {
    const n = parseInt(color.slice(1), 16);
    const luma = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    const dark = luma > 0.5;
    return new PIXI.TextStyle({
      fontFamily: font,
      fontSize: 100,
      fill: dark ? "#1a1a1a" : "#f4f1e8",
      stroke: dark ? "#f4f1e8" : "#1a1a1a",
    });
  }

  // advance width in em; textmetrics measures with a canvas context
  #measure(ch: string, style: PIXI.TextStyle): number {
    const width = PIXI.TextMetrics.measureText(ch, style).width / (style.fontSize as number);
    return width || 0.3;
  }

  // letters are placed one by one along the curve by arc length
  #drawLabel(chars: string[], advances: number[], layout: LabelLayout, base: PIXI.TextStyle): LabelContainer {
    const label = new PIXI.Container() as LabelContainer;
    label.worldLength = layout.length;
    label.zoom = 0;
    const style = base.clone();
    style.fontSize = layout.fontSize;
    style.strokeThickness = Math.max(1, layout.fontSize * 0.08);

    // sampled arc length table along the curve
    const samples = 64;
    const xs: number[] = [];
    const arc: number[] = [];
    let last = curveAt(layout, layout.x0);
    for (let k = 0; k <= samples; k++) {
      const x = layout.x0 + ((layout.x1 - layout.x0) * k) / samples;
      const p = curveAt(layout, x);
      xs.push(x);
      arc.push(k ? arc[k - 1] + Math.hypot(p.x - last.x, p.y - last.y) : 0);
      last = p;
    }
    const xAt = (s: number): number => {
      let k = 1;
      while (k < samples && arc[k] < s) k++;
      const t = (s - arc[k - 1]) / (arc[k] - arc[k - 1] || 1);
      return xs[k - 1] + (xs[k] - xs[k - 1]) * t;
    };

    const total = advances.reduce((a, b) => a + b, 0) * layout.fontSize + layout.spacing * (chars.length - 1);
    let s = (arc[samples] - total) / 2;
    chars.forEach((ch, k) => {
      const advance = advances[k] * layout.fontSize;
      const p = curveAt(layout, xAt(s + advance / 2));
      s += advance + layout.spacing;
      if (!ch.trim()) return;
      const text = new PIXI.Text(ch, style);
      text.anchor.set(0.5);
      text.position.set(p.x, p.y);
      text.rotation = p.rotation;
      label.addChild(text);
    });
    return label;
  }

  // hides labels under the min width and re-rasterizes text per zoom bucket
  updateLabels(): void {
    const labels = this.#labels;
    if (!labels || labels.destroyed) return;
    const scale = canvas?.stage?.scale.x ?? 1;
    const minWidth = getLabelOptions(canvas?.scene).minWidth;
    // power of two zoom buckets
    const zoom = 2 ** Math.ceil(Math.log2(scale * window.devicePixelRatio));
    for (const label of labels.children as LabelContainer[]) {
      label.visible = label.worldLength * scale >= minWidth;
      if (!label.visible || label.zoom === zoom) continue;
      label.zoom = zoom;
      for (const text of label.children as PIXI.Text[]) {
        // texture size is fontsize × resolution
        const cap = CONSTANTS.LABEL_MAX_TEXTURE / (text.style.fontSize as number);
        text.resolution = Math.max(0.25, Math.min(zoom, CONSTANTS.LABEL_MAX_RESOLUTION, cap));
      }
    }
  }

  // getvertices returns the cell polygon for any grid type
  #drawCell(g: PIXI.Graphics, key: string, color: string, fillAlpha = 1): void {
    const points = canvas!.grid!.getVertices(this.#offset(key)).flatMap((p) => [p.x, p.y]);
    g.beginFill(color, fillAlpha).drawPolygon(points).endFill();
  }

  // cell keys are "row,column" offsets
  #offset(key: string): { i: number; j: number } {
    const [i, j] = key.split(",").map(Number);
    return { i, j };
  }

  #pointAt(event: PIXI.FederatedPointerEvent): PIXI.Point {
    return event.getLocalPosition(this);
  }

  // getoffset snaps a canvas point to its grid row/column
  #keyAt(event: PIXI.FederatedPointerEvent): string | null {
    const point = this.#pointAt(event);
    if (!canvas?.dimensions?.sceneRect.contains(point.x, point.y)) return null;
    const { i, j } = canvas.grid!.getOffset(point);
    return `${i},${j}`;
  }

  // getdirectpath walks every cell between two offsets on any grid type
  #lineKeys(from: string, to: string): string[] {
    return canvas!.grid!.getDirectPath([this.#offset(from), this.#offset(to)]).map(({ i, j }) => `${i},${j}`);
  }

  // offset rows/columns between two corners, clamped to the scene
  #rectKeys(a: PIXI.IPointData, b: PIXI.IPointData): string[] {
    const rect = canvas!.dimensions!.sceneRect;
    const clamp = (p: PIXI.IPointData) => ({
      x: Math.clamp(p.x, rect.left, rect.right - 1),
      y: Math.clamp(p.y, rect.top, rect.bottom - 1),
    });
    const start = canvas!.grid!.getOffset(clamp(a));
    const end = canvas!.grid!.getOffset(clamp(b));
    const keys: string[] = [];
    for (let i = Math.min(start.i, end.i); i <= Math.max(start.i, end.i); i++) {
      for (let j = Math.min(start.j, end.j); j <= Math.max(start.j, end.j); j++) keys.push(`${i},${j}`);
    }
    return keys;
  }

  #previewColor(erase: boolean): string {
    return erase ? "#ff00ff" : getPaletteColor();
  }

  #drawRectPreview(to: PIXI.IPointData): void {
    const from = this.#rectOrigin!;
    const color = this.#previewColor(this.tool === "erase");
    this.#preview.clear();
    for (const k of this.#rectKeys(from, to)) this.#drawCell(this.#preview, k, color, 0.5);
    this.#preview
      .lineStyle(2, color, 1)
      .drawRect(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.abs(to.x - from.x), Math.abs(to.y - from.y))
      .lineStyle(0);
  }

  #setCell(key: string, erase: boolean): void {
    this.#pending[key] = erase ? null : getPaletteColor();
    this.#anchor = key;
  }

  #paint(event: PIXI.FederatedPointerEvent, erase: boolean): void {
    const key = this.#keyAt(event);
    if (!key) return;
    if (this.#pending[key] === (erase ? null : getPaletteColor())) return;
    this.#setCell(key, erase);
    this.refresh();
  }

  // shift-click paints from the anchor to the clicked cell
  #paintLine(event: PIXI.FederatedPointerEvent, erase: boolean): void {
    const key = this.#keyAt(event);
    if (!key) return;
    const keys = this.#anchor ? this.#lineKeys(this.#anchor, key) : [key];
    for (const k of keys) this.#setCell(k, erase);
    this.refresh();
  }

  #click(event: PIXI.FederatedPointerEvent, erase: boolean): void {
    if (event.shiftKey) this.#paintLine(event, erase);
    else this.#paint(event, erase);
    void this.#commit();
  }

  // one pending batch becomes one undo step
  async #commit(): Promise<void> {
    if (!canvas?.scene || !Object.keys(this.#pending).length) return;
    const changes = this.#pending;
    this.#pending = {};
    const command = PaintCommand.from(this.#savedCells(), changes);
    if (!command) return this.refresh();
    // inflight keeps the stroke drawn while it waits in the queue
    Object.assign(this.#inflight, command.after);
    await this.#history.execute(command);
  }

  // saved flags plus writes still on their way to the gm
  #savedCells(): CellChanges {
    return { ...getCells(canvas?.scene), ...this.#inflight };
  }

  // edittarget receiver; failed commits fall back to the saved flags
  async apply(edit: OverlayEdit): Promise<boolean> {
    const scene = canvas?.scene;
    if (!scene) return false;
    Object.assign(this.#inflight, edit.cells);
    this.refresh();
    const ok = await commitChanges(scene, edit.cells, edit.legend);
    for (const key of Object.keys(edit.cells)) delete this.#inflight[key];
    this.refresh();
    return ok;
  }

  recolor(from: string, to: string): Promise<boolean> {
    const cells = Object.fromEntries(Object.entries(this.#savedCells()).filter(([, c]) => c)) as CellMap;
    return this.#history.execute(new RecolorCommand(cells, getLegend(canvas?.scene), from, to));
  }

  // erases every cell as one undo step
  async reset(): Promise<void> {
    const saved = this.#savedCells();
    const command = PaintCommand.from(saved, Object.fromEntries(Object.keys(saved).map((k) => [k, null])));
    if (command) await this.#history.execute(command);
  }

  undo(): boolean {
    if (!this.#history.canUndo) return false;
    void this.#history.undo();
    return true;
  }

  redo(): boolean {
    if (!this.#history.canRedo) return false;
    void this.#history.redo();
    return true;
  }

  // core ctrl+z keybinding calls this on the active layer
  protected override _onUndoKey(_event: KeyboardEvent): boolean {
    return this.undo();
  }

  /* -------------------------------------------- */
  /*  Activation                                  */
  /* -------------------------------------------- */

  protected override _activate(): void {
    if (!canvas?.grid || canvas.grid.isGridless) {
      ui.notifications?.warn("POLITICAL_OVERLAY.errors.gridless", { localize: true });
    }
    canvas?.stage?.on("pointermove", this.#onHover);
    canvas?.stage?.on("pointerdown", this.#onMiddleDown);
    canvas?.stage?.on("pointerup", this.#onMiddleUp);
    canvas?.stage?.on("pointerupoutside", this.#onMiddleUp);
    this.refresh();
  }

  protected override _deactivate(): void {
    canvas?.stage?.off("pointermove", this.#onHover);
    canvas?.stage?.off("pointerdown", this.#onMiddleDown);
    canvas?.stage?.off("pointerup", this.#onMiddleUp);
    canvas?.stage?.off("pointerupoutside", this.#onMiddleUp);
    if (this.#erasing) {
      this.#erasing = false;
      void this.#commit();
    }
    this.#preview?.clear();
    this.refresh();
  }

  // stage pointermove fires even when no drag is active
  #onHover = (event: PIXI.FederatedPointerEvent): void => {
    if (this.#rectOrigin) return;
    if (this.#erasing) this.#paint(event, true);
    this.#preview.clear();
    const key = this.#keyAt(event);
    if (!key) return;
    const color = this.#previewColor(this.#erasing || this.tool === "erase");
    const keys = event.shiftKey && this.#anchor ? this.#lineKeys(this.#anchor, key) : [key];
    for (const k of keys) this.#drawCell(this.#preview, k, color, 0.5);
  };

  // button 1 is the middle mouse button; the mouse manager only tracks left and right
  #onMiddleDown = (event: PIXI.FederatedPointerEvent): void => {
    if (event.button !== 1) return;
    // middle click starts browser autoscroll
    (event.nativeEvent as PointerEvent).preventDefault();
    this.#erasing = true;
    this.#paint(event, true);
  };

  #onMiddleUp = (event: PIXI.FederatedPointerEvent): void => {
    if (event.button !== 1 || !this.#erasing) return;
    this.#erasing = false;
    void this.#commit();
  };

  /* -------------------------------------------- */
  /*  Mouse handlers                              */
  /* -------------------------------------------- */

  protected override _onClickLeft(event: any): void {
    this.#click(event, this.tool === "erase");
  }

  // ctrl maps to cmd on mac through the keyboard manager
  protected override _onDragLeftStart(event: any): void {
    if (getGame().keyboard?.isModifierActive(foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL as any)) {
      this.#rectOrigin = { ...(event.interactionData?.origin ?? this.#pointAt(event)) };
      this.#drawRectPreview(this.#pointAt(event));
      return;
    }
    this.#paint(event, this.tool === "erase");
  }

  protected override _onDragLeftMove(event: any): void {
    if (this.#rectOrigin) return this.#drawRectPreview(this.#pointAt(event));
    this.#paint(event, this.tool === "erase");
  }

  protected override _onDragLeftDrop(event: any): void {
    if (this.#rectOrigin) {
      const erase = this.tool === "erase";
      for (const k of this.#rectKeys(this.#rectOrigin, this.#pointAt(event))) this.#setCell(k, erase);
      this.#rectOrigin = null;
      this.#preview.clear();
      this.refresh();
    }
    void this.#commit();
  }

  protected override _onDragLeftCancel(_event: any): void {
    this.#rectOrigin = null;
    this.#preview.clear();
    this.#pending = {};
    this.refresh();
  }
}
