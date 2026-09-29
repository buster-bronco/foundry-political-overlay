import { CONSTANTS } from "../constants";
import { getFlags, getLegendEntries } from "../overlay";
import { isGM } from "../utils";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// floating key of painted colors for the viewed scene
export default class LegendWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance: LegendWindow | null = null;

  static override DEFAULT_OPTIONS: any = {
    id: "political-overlay-legend",
    classes: ["political-overlay-legend"],
    window: { title: "POLITICAL_OVERLAY.legend.title", icon: "fa-solid fa-list", minimizable: true },
    position: { width: 220, height: "auto", left: 120 },
  };

  static override PARTS = {
    body: { template: `modules/${CONSTANTS.MODULE_ID}/templates/legend.hbs` },
  };

  // players only get the legend while the overlay is shown
  static hasEntries(): boolean {
    const scene = canvas?.scene;
    if (!scene || !getLegendEntries(scene).length) return false;
    return isGM() || !!getFlags(scene).visible;
  }

  // legend lives inside the political overlay control
  static shouldShow(): boolean {
    return this.#inControl && this.hasEntries();
  }

  static #inControl = false;
  // last hasentries result; a flip rebuilds the control buttons
  static #hadEntries = false;
  // last shouldshow result; only a false to true edge force-opens the window
  static #wasShown = false;

  static setInControl(active: boolean): void {
    this.#inControl = active;
    this.sync(true);
  }

  // newscene treats the scene as unseen so its legend opens
  static sync(newScene = false): void {
    const entries = this.hasEntries();
    // reset re-runs getscenecontrolbuttons so the legend tool shows or hides
    if (!newScene && entries !== this.#hadEntries) void ui.controls?.render({ reset: true } as any);
    this.#hadEntries = entries;

    const show = this.shouldShow();
    const opening = show && (newScene || !this.#wasShown);
    this.#wasShown = show;
    if (!show) return void this.#instance?.close();
    if (opening) this.open();
    else if (this.#instance?.rendered) void this.#instance.render();
  }

  static open(): void {
    // top is measured from the viewport since position has no bottom
    this.#instance ??= new LegendWindow({ position: { top: Math.max(80, window.innerHeight - 320) } });
    void this.#instance.render({ force: true });
  }

  override async _prepareContext(_options: any): Promise<any> {
    return {
      entries: getLegendEntries(canvas?.scene),
      isGM: isGM(),
    };
  }
}
