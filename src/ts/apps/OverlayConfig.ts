import { CONSTANTS } from "../constants";
import { getFlags, getLabelOptions } from "../overlay";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// per-scene gm options; edits save as soon as a field changes
export default class OverlayConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  scene: Scene;

  constructor(scene: Scene, options: any = {}) {
    super(options);
    this.scene = scene;
  }

  static override DEFAULT_OPTIONS: any = {
    id: "political-overlay-config",
    tag: "form",
    classes: ["political-overlay-config"],
    window: { title: "POLITICAL_OVERLAY.config.title", icon: "fa-solid fa-handshake" },
    position: { width: 400, height: "auto" },
    form: { handler: OverlayConfig.onSubmit, submitOnChange: true, closeOnSubmit: false },
  };

  static override PARTS = {
    body: { template: `modules/${CONSTANTS.MODULE_ID}/templates/overlay-config.hbs` },
  };

  override async _prepareContext(_options: any): Promise<any> {
    const flags = getFlags(this.scene);
    const labels = getLabelOptions(this.scene);
    return {
      gmAlpha: flags.gmAlpha ?? CONSTANTS.DEFAULT_ALPHA,
      playerAlpha: flags.playerAlpha ?? CONSTANTS.DEFAULT_ALPHA,
      labelsEnabled: labels.enabled,
      labelGap: labels.gap,
      labelMinWidth: labels.minWidth,
    };
  }

  private static async onSubmit(this: OverlayConfig, _event: Event, _form: HTMLFormElement, formData: any): Promise<void> {
    const { gmAlpha, playerAlpha, labelsEnabled, labelGap, labelMinWidth } = formData.object;
    await this.scene.update({
      [`flags.${CONSTANTS.MODULE_ID}.gmAlpha`]: Number(gmAlpha),
      [`flags.${CONSTANTS.MODULE_ID}.playerAlpha`]: Number(playerAlpha),
      [`flags.${CONSTANTS.MODULE_ID}.labelsEnabled`]: !!labelsEnabled,
      [`flags.${CONSTANTS.MODULE_ID}.labelGap`]: Number(labelGap),
      [`flags.${CONSTANTS.MODULE_ID}.labelMinWidth`]: Number(labelMinWidth),
    } as any);
  }
}
