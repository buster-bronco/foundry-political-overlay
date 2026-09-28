import { CONSTANTS, PALETTE } from "./constants";
import { getGame } from "./utils";

export const registerSettings = function () {
  const settings = getGame().settings;

  // world settings are gm-writable only; client settings are per browser
  settings.register(CONSTANTS.MODULE_ID, "playerEditable", {
    name: "POLITICAL_OVERLAY.settings.playerEditable.name",
    hint: "POLITICAL_OVERLAY.settings.playerEditable.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    // reset rebuilds the control list from getSceneControlButtons
    onChange: () => ui.controls?.render({ reset: true }),
  } as any);

  settings.register(CONSTANTS.MODULE_ID, "paletteColor", {
    name: "Palette Color",
    scope: "client",
    config: false,
    type: String,
    default: PALETTE[0].color,
  });
};

export const isPlayerEditable = (): boolean => {
  return getGame().settings.get(CONSTANTS.MODULE_ID, "playerEditable") as boolean;
};

export const getPaletteColor = (): string => {
  return getGame().settings.get(CONSTANTS.MODULE_ID, "paletteColor") as string;
};

export const setPaletteColor = async (color: string): Promise<void> => {
  await getGame().settings.set(CONSTANTS.MODULE_ID, "paletteColor", color);
};
