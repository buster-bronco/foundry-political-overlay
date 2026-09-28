// key is a grid offset "i,j"; value is a css hex color
export type CellMap = Record<string, string>;

// null erases the cell
export type CellChanges = Record<string, string | null>;

export type OverlayTool = "paint" | "erase";

export interface OverlayFlags {
  visible?: boolean;
  gmAlpha?: number;
  playerAlpha?: number;
  cells?: CellMap;
}

export interface PaintQueryData {
  sceneId: string;
  userId: string;
  changes: CellChanges;
}
