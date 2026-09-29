import { CONSTANTS } from "../constants";
import { colorKey, getFlags, getLegendColors, getLegendEntries, setLegendEntries } from "../overlay";
import type { LegendMap } from "../types";
import { getGame, isGM } from "../utils";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// floating key of painted colors for the viewed scene
export default class LegendWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance: LegendWindow | null = null;

  // unsaved name edits; a re-render would wipe them
  #dirty = false;

  static override DEFAULT_OPTIONS: any = {
    id: "political-overlay-legend",
    tag: "form",
    classes: ["political-overlay-legend"],
    window: { title: "POLITICAL_OVERLAY.legend.title", icon: "fa-solid fa-list", minimizable: true },
    position: { width: 220, height: "auto", left: 120 },
    form: { handler: LegendWindow.onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {
      revert: LegendWindow.onRevert,
    },
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
  // painted color keys at the last sync
  static #lastColors = new Set<string>();

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

    this.#lastColors = new Set(getLegendColors(canvas?.scene).map(colorKey));

    const show = this.shouldShow();
    const opening = show && (newScene || !this.#wasShown);
    this.#wasShown = show;
    if (!show) return void this.#instance?.close();
    if (opening) this.open();
    else this.#refresh();
  }

  static #refresh(): void {
    const app = this.#instance;
    if (app?.rendered && !app.#dirty) void app.render();
  }

  // userid is the client that made the scene update
  static onSceneUpdate(changes: object, userId: string): void {
    const self = userId === getGame().user?.id;
    const legendPath = `flags.${CONSTANTS.MODULE_ID}.legend`;
    const legendOnly = foundry.utils.hasProperty(changes, legendPath) && !foundry.utils.hasProperty(changes, `flags.${CONSTANTS.MODULE_ID}.cells`);
    // the submit handler re-renders the editing gm's window itself
    if (self && legendOnly) return;

    const newColor = getLegendColors(canvas?.scene).some((c) => !this.#lastColors.has(colorKey(c)));
    const bindingChanged = foundry.utils.hasProperty(changes, legendPath) || newColor;
    this.sync();
    if (!self && bindingChanged && this.shouldShow() && !this.#instance?.rendered) this.open();
  }

  static open(): void {
    // top is measured from the viewport since position has no bottom
    this.#instance ??= new LegendWindow({ position: { top: Math.max(80, window.innerHeight - 320) } });
    if (this.#instance.rendered && this.#instance.#dirty) return this.#instance.bringToFront();
    void this.#instance.render({ force: true });
  }

  override async _prepareContext(_options: any): Promise<any> {
    return {
      entries: getLegendEntries(canvas?.scene),
      isGM: isGM(),
    };
  }

  // the form element survives re-renders; only the parts are replaced
  protected override async _onFirstRender(context: any, options: any): Promise<void> {
    await super._onFirstRender(context, options);
    this.element.addEventListener("input", () => {
      this.#dirty = true;
      this.element.classList.add("dirty");
    });
  }

  protected override async _onRender(context: any, options: any): Promise<void> {
    await super._onRender(context, options);
    this.#dirty = false;
    this.element.classList.remove("dirty");
  }

  private static onRevert(this: LegendWindow): void {
    void this.render();
  }

  // formdataextended keys like "ff4500.name" expand into nested entries
  private static async onSubmit(this: LegendWindow, _event: Event, _form: HTMLFormElement, formData: any): Promise<void> {
    const scene = canvas?.scene;
    if (!scene || !isGM()) return;
    await setLegendEntries(scene, foundry.utils.expandObject(formData.object) as LegendMap);
    // own legend updates skip the updatescene re-render
    void this.render();
  }
}
