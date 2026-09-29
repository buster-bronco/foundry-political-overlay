import { CONSTANTS } from "../constants";
import { commitChanges, getAlpha, getCells, getFlags } from "../overlay";
import { getPaletteColor } from "../settings";
import type { CellChanges, OverlayTool } from "../types";

const { InteractionLayer } = foundry.canvas.layers;

// registered under the interface canvas group; lives at canvas.politicalOverlay
export default class PoliticalOverlayLayer extends InteractionLayer {
  tool: OverlayTool = "paint";

  #cells!: PIXI.Graphics;
  #preview!: PIXI.Graphics;
  // strokes not yet echoed back through updateScene
  #pending: CellChanges = {};
  #inflight: CellChanges = {};
  // last painted cell; start point for shift-click lines
  #anchor: string | null = null;

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
    this.#preview = this.addChild(new PIXI.Graphics());
    this.#pending = {};
    this.#inflight = {};
    this.#anchor = null;
    this.refresh();
  }

  refresh(): void {
    if (!this.#cells || !canvas?.scene) return;
    const scene = canvas.scene;
    const cells = { ...getCells(scene), ...this.#inflight, ...this.#pending };

    // editors see a faded overlay while it's hidden from players
    const shown = !!getFlags(scene).visible;
    this.#cells.visible = shown || this.active;
    this.#cells.alpha = getAlpha(scene) * (shown ? 1 : CONSTANTS.HIDDEN_ALPHA_SCALE);
    this.#cells.clear();
    for (const [key, color] of Object.entries(cells)) {
      if (color) this.#drawCell(this.#cells, key, color);
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

  async #commit(): Promise<void> {
    if (!canvas?.scene || !Object.keys(this.#pending).length) return;
    const changes = this.#pending;
    this.#pending = {};
    Object.assign(this.#inflight, changes);
    await commitChanges(canvas.scene, changes);
    // failed commits fall back to the saved flags
    for (const key of Object.keys(changes)) delete this.#inflight[key];
    this.refresh();
  }

  /* -------------------------------------------- */
  /*  Activation                                  */
  /* -------------------------------------------- */

  protected override _activate(): void {
    if (!canvas?.grid || canvas.grid.isGridless) {
      ui.notifications?.warn("POLITICAL_OVERLAY.errors.gridless", { localize: true });
    }
    canvas?.stage?.on("pointermove", this.#onHover);
    this.refresh();
  }

  protected override _deactivate(): void {
    canvas?.stage?.off("pointermove", this.#onHover);
    this.#preview?.clear();
    this.refresh();
  }

  // stage pointermove fires even when no drag is active
  #onHover = (event: PIXI.FederatedPointerEvent): void => {
    this.#preview.clear();
    const key = this.#keyAt(event);
    if (!key) return;
    const color = this.tool === "erase" ? "#ff00ff" : getPaletteColor();
    const keys = event.shiftKey && this.#anchor ? this.#lineKeys(this.#anchor, key) : [key];
    for (const k of keys) this.#drawCell(this.#preview, k, color, 0.5);
  };

  /* -------------------------------------------- */
  /*  Mouse handlers                              */
  /* -------------------------------------------- */

  protected override _onClickLeft(event: any): void {
    this.#click(event, this.tool === "erase");
  }

  protected override _onDragLeftStart(event: any): void {
    this.#paint(event, this.tool === "erase");
  }

  protected override _onDragLeftMove(event: any): void {
    this.#paint(event, this.tool === "erase");
  }

  protected override _onDragLeftDrop(_event: any): void {
    void this.#commit();
  }

  protected override _onDragLeftCancel(_event: any): void {
    this.#pending = {};
    this.refresh();
  }

  // right click erases with any tool
  protected override _onClickRight(event: any): void {
    this.#click(event, true);
  }
}
