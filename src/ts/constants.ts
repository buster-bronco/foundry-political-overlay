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
  // label defaults; gap is in cells, min width in screen px
  LABEL_GAP: 1,
  LABEL_MIN_WIDTH: 80,
  LABEL_FONT: "Signika",
  // max bow height as a fraction of half the label length
  LABEL_MAX_CURVE: 0.18,
  // letter spacing in em
  LABEL_LETTER_SPACING: 0.25,
  // extra spread between letters in em when the blob is long
  LABEL_MAX_SPREAD: 0.8,
  // fraction of the centerline span the text may cover
  LABEL_FILL: 0.85,
  // font size as a fraction of blob thickness
  LABEL_THICK_FILL: 0.6,
  // slices thinner than this fraction of the median are tails
  LABEL_TAIL_TRIM: 0.4,
  LABEL_ANGLES: 24,
  LABEL_TILT_PENALTY: 0.12,
  LABEL_SLOPE_PENALTY: 0.5,
  // curve points checked against the blob
  LABEL_SAMPLES: 8,
  // neighbour reach in cell steps; covers square diagonals
  LABEL_JOIN_FACTOR: 1.5,
  // max step between cells in one perpendicular run, in cell steps
  LABEL_RUN_GAP: 1.75,
  LABEL_REBUILD_DELAY: 150,
  LABEL_MAX_RESOLUTION: 4,
  // max rasterized glyph size in px
  LABEL_MAX_TEXTURE: 1024,
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
