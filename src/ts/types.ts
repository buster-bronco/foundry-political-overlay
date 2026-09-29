// key is a grid offset "i,j"; value is a css hex color
export type CellMap = Record<string, string>;

// null erases the cell
export type CellChanges = Record<string, string | null>;

export type OverlayTool = "paint" | "erase";

// dm-set label for one painted color
export interface LegendEntry {
  name?: string;
}

// key is the hex color without "#"
export type LegendMap = Record<string, LegendEntry>;

export interface OverlayFlags {
  visible?: boolean;
  gmAlpha?: number;
  playerAlpha?: number;
  cells?: CellMap;
  legend?: LegendMap;
  labelsEnabled?: boolean;
  labelGap?: number;
  labelMinWidth?: number;
}

export interface LabelOptions {
  enabled: boolean;
  gap: number;
  minWidth: number;
}

export interface PaintQueryData {
  sceneId: string;
  userId: string;
  changes: CellChanges;
}
