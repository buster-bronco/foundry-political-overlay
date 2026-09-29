import "../styles/style.scss";
import { CONSTANTS } from "./constants";
import { registerControls } from "./controls";
import PoliticalOverlayLayer from "./layer/PoliticalOverlayLayer";
import { registerQueries } from "./overlay";
import { loadFontChoices, registerSettings } from "./settings";

Hooks.once("init", () => {
  console.log(`${CONSTANTS.DEBUG_PREFIX} initializing ${CONSTANTS.MODULE_ID}`);
  registerSettings();
  registerQueries();
  PoliticalOverlayLayer.register();
  registerControls();
});

Hooks.once("setup", () => loadFontChoices());

Hooks.once("ready", () => {
  console.log(`${CONSTANTS.DEBUG_PREFIX} ready`);
});
