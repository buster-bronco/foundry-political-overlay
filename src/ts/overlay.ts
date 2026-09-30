import { CONSTANTS, PALETTE } from "./constants";
import { isPlayerEditable } from "./settings";
import type { CellChanges, CellMap, LabelOptions, LegendMap, OverlayFlags, PaintQueryData } from "./types";
import { getGame } from "./utils";

export const getFlags = (scene: Scene | null | undefined): OverlayFlags => {
  return (scene?.flags?.[CONSTANTS.MODULE_ID] as OverlayFlags | undefined) ?? {};
};

export const getCells = (scene: Scene | null | undefined): CellMap => getFlags(scene).cells ?? {};

// flag paths split on "." so the "#" is dropped from legend keys
export const colorKey = (color: string): string => color.replace(/^#/, "").toLowerCase();

// unique painted colors in first-seen order
export const getLegendColors = (scene: Scene | null | undefined, cells = getCells(scene)): string[] => {
  const seen = new Map<string, string>();
  for (const color of Object.values(cells)) {
    const key = colorKey(color);
    if (!seen.has(key)) seen.set(key, `#${key}`);
  }
  return [...seen.values()];
};

export const getLegend = (scene: Scene | null | undefined): LegendMap => getFlags(scene).legend ?? {};

export interface LegendRow {
  color: string;
  key: string;
  name: string;
  customName: string;
}

export const getLegendEntries = (scene: Scene | null | undefined, cells = getCells(scene)): LegendRow[] => {
  const legend = getLegend(scene);
  return getLegendColors(scene, cells).map((color) => {
    const key = colorKey(color);
    const entry = legend[key] ?? {};
    const fallback = PALETTE.find((p) => colorKey(p.color) === key)?.name ?? color;
    return { color, key, name: entry.name || fallback, customName: entry.name ?? "" };
  });
};

// writes only the legend fields that differ from the saved flags
export async function setLegendEntries(scene: Scene, entries: LegendMap): Promise<void> {
  const legend = getLegend(scene);
  const update: Record<string, string> = {};
  for (const [key, entry] of Object.entries(entries)) {
    const name = (entry.name ?? "").trim();
    if (name !== (legend[key]?.name ?? "")) update[`flags.${CONSTANTS.MODULE_ID}.legend.${key}.name`] = name;
  }
  if (Object.keys(update).length) await scene.update(update as any);
}

export const getAlpha = (scene: Scene | null | undefined): number => {
  const flags = getFlags(scene);
  const alpha = getGame().user?.isGM ? flags.gmAlpha : flags.playerAlpha;
  return alpha ?? CONSTANTS.DEFAULT_ALPHA;
};

export const getLabelOptions = (scene: Scene | null | undefined): LabelOptions => {
  const flags = getFlags(scene);
  return {
    enabled: flags.labelsEnabled ?? true,
    gap: flags.labelGap ?? CONSTANTS.LABEL_GAP,
    minWidth: flags.labelMinWidth ?? CONSTANTS.LABEL_MIN_WIDTH,
  };
};

// drawing_create is the core permission for placing drawings
export const canEdit = (user: User | null | undefined): boolean => {
  if (!user) return false;
  if (user.isGM) return true;
  return isPlayerEditable() && user.can("DRAWING_CREATE");
};

// scene updates need owner permission, so strokes go through the active gm
export async function commitChanges(scene: Scene, changes: CellChanges): Promise<boolean> {
  if (!Object.keys(changes).length) return true;
  const g = getGame();
  const gm = g.users?.activeGM;
  if (!gm) {
    ui.notifications?.error("POLITICAL_OVERLAY.errors.noGM", { localize: true });
    return false;
  }
  const data: PaintQueryData = { sceneId: scene.id!, userId: g.user!.id!, changes };
  if (gm.isSelf) return applyPaint(data);
  return (await gm.query(CONSTANTS.PAINT_QUERY as any, data as any)) as boolean;
}

export async function setVisible(scene: Scene, visible: boolean): Promise<void> {
  await scene.setFlag(CONSTANTS.MODULE_ID, "visible", visible);
}

// forceddeletion is the v14 replacement for "-=key" update syntax
export async function resetCells(scene: Scene): Promise<void> {
  await scene.update({ [`flags.${CONSTANTS.MODULE_ID}.cells`]: foundry.data.operators.ForcedDeletion.create() } as any);
}

// runs on the gm client; one update per stroke
async function applyPaint({ sceneId, userId, changes }: PaintQueryData): Promise<boolean> {
  const g = getGame();
  const scene = g.scenes?.get(sceneId);
  if (!scene || !canEdit(g.users?.get(userId))) return false;
  const update: Record<string, unknown> = {};
  const { ForcedDeletion } = foundry.data.operators;
  for (const [key, color] of Object.entries(changes)) {
    update[`flags.${CONSTANTS.MODULE_ID}.cells.${key}`] = color ?? ForcedDeletion.create();
  }
  await scene.update(update as any);
  return true;
}

export function registerQueries(): void {
  (CONFIG.queries as any)[CONSTANTS.PAINT_QUERY] = applyPaint;
}
