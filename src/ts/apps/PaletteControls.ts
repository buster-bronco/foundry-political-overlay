import { CONSTANTS, PALETTE } from "../constants";
import { colorKey, getCells, getLegendEntries } from "../overlay";
import { getPaletteColor, setPaletteColor } from "../settings";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// floating color picker shown while the overlay control is active
export default class PaletteControls extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance: PaletteControls | null = null;

  static override DEFAULT_OPTIONS: any = {
    id: "political-overlay-palette",
    tag: "form",
    classes: ["political-overlay-palette"],
    window: { title: "POLITICAL_OVERLAY.palette.title", icon: "fa-solid fa-palette", minimizable: true },
    position: { width: 220, height: "auto", top: 80, left: 120 },
    form: { handler: PaletteControls.onSubmit, submitOnChange: true, closeOnSubmit: false },
    actions: {
      pick: PaletteControls.onPick,
    },
  };

  static override PARTS = {
    body: { template: `modules/${CONSTANTS.MODULE_ID}/templates/palette.hbs` },
  };

  static open(): void {
    this.#instance ??= new PaletteControls();
    void this.#instance.render({ force: true });
  }

  static close(): void {
    void this.#instance?.close();
  }

  // re-renders when painted colors change
  static sync(): void {
    if (this.#instance?.rendered) void this.#instance.render();
  }

  // painted colors outside the base palette; gone once erased from the scene
  static #customColors(): { name: string; color: string }[] {
    const scene = canvas?.scene;
    const all = getCells(scene);
    const cells = (canvas as any)?.[CONSTANTS.LAYER_NAME]?.filterSeen(all) ?? all;
    const base = new Set(PALETTE.map((c) => colorKey(c.color)));
    return getLegendEntries(scene, cells)
      .filter((e) => !base.has(e.key))
      .map((e) => ({ name: e.name, color: e.color }));
  }

  override async _prepareContext(_options: any): Promise<any> {
    const current = getPaletteColor();
    const mark = (c: { name: string; color: string }) => ({ ...c, active: colorKey(c.color) === colorKey(current) });
    return {
      current,
      colors: PALETTE.map(mark),
      custom: PaletteControls.#customColors().map(mark),
    };
  }

  // formdataextended.object holds the named input values
  private static async onSubmit(this: PaletteControls, _event: Event, _form: HTMLFormElement, formData: any): Promise<void> {
    const color = formData.object.color as string | undefined;
    if (color) await setPaletteColor(color);
    this.render();
  }

  private static async onPick(this: PaletteControls, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const color = target.dataset.color;
    if (!color) return;
    await setPaletteColor(color);
    this.render();
  }
}
