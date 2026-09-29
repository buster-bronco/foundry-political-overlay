import { id } from "./../module.json";

export const CONSTANTS = {
  MODULE_ID: id as "foundry-political-overlay",
  MODULE_NAME: "Political Overlay",
  DEBUG_PREFIX: "POLITICAL-OVERLAY:",
  // canvas.<name> and the scene control key
  LAYER_NAME: "politicalOverlay",
  // module queries must be prefixed with the module id
  PAINT_QUERY: `${id}.paint`,
  DEFAULT_ALPHA: 0.5,
  // alpha multiplier for the editor's view of a hidden overlay
  HIDDEN_ALPHA_SCALE: 0.35,
  // below drawings (zindex 20 in the interface group)
  LAYER_Z_INDEX: 19,
} as const;

// base palette from cirrahn/foundry-polmap (mit)
export const PALETTE: { name: string; color: string }[] = [
  { name: "Red", color: "#ff4500" },
  { name: "Orange", color: "#ffa800" },
  { name: "Yellow", color: "#ffd635" },
  { name: "Dark green", color: "#00a368" },
  { name: "Light green", color: "#7eed56" },
  { name: "Dark blue", color: "#2450a4" },
  { name: "Blue", color: "#3690ea" },
  { name: "Light blue", color: "#51e9f4" },
  { name: "Dark purple", color: "#811e9f" },
  { name: "Purple", color: "#b44ac0" },
  { name: "Light pink", color: "#ff99aa" },
  { name: "Brown", color: "#9c6926" },
  { name: "White", color: "#ffffff" },
  { name: "Light gray", color: "#d4d7d9" },
  { name: "Gray", color: "#898d90" },
  { name: "Black", color: "#000000" },
];

export default CONSTANTS;
