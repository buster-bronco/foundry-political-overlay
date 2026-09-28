import { CONSTANTS, PALETTE } from "../constants";
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

  override async _prepareContext(_options: any): Promise<any> {
    const current = getPaletteColor();
    return {
      current,
      colors: PALETTE.map((c) => ({ ...c, active: c.color === current })),
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
