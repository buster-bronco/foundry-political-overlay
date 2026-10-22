import type { CellChanges } from "./types";

interface Offset {
  i: number;
  j: number;
}

interface Point {
  x: number;
  y: number;
}

export interface FillBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Structural grid access keeps the search independent of Foundry and PIXI.
export interface FillGrid {
  isSquare: boolean;
  getAdjacentOffsets(offset: Offset): Offset[];
  getOffsetRange(bounds: FillBounds): [number, number, number, number];
  getVertices(offset: Offset): Point[];
}

export type FillResult = { status: "filled"; changes: CellChanges } | { status: "noop" } | { status: "open" };

const keyOf = ({ i, j }: Offset): string => `${i},${j}`;
const normalized = (color: string | null | undefined): string | null => color?.replace(/^#/, "").toLowerCase() ?? null;

// Clip one side of a convex cell polygon, preserving partial cells at scene edges.
function clip(points: Point[], axis: "x" | "y", edge: number, greater: boolean): Point[] {
  const result: Point[] = [];
  if (!points.length) return result;
  let previous = points[points.length - 1];
  let previousInside = greater ? previous[axis] >= edge : previous[axis] <= edge;
  for (const current of points) {
    const inside = greater ? current[axis] >= edge : current[axis] <= edge;
    if (inside !== previousInside) {
      const t = (edge - previous[axis]) / (current[axis] - previous[axis]);
      const crossing = {
        x: previous.x + t * (current.x - previous.x),
        y: previous.y + t * (current.y - previous.y),
      };
      crossing[axis] = edge;
      result.push(crossing);
    }
    if (inside) result.push(current);
    previous = current;
    previousInside = inside;
  }
  return result;
}

function inScene(points: Point[], bounds: FillBounds): Point[] {
  let polygon = clip(points, "x", bounds.x, true);
  polygon = clip(polygon, "x", bounds.x + bounds.width, false);
  polygon = clip(polygon, "y", bounds.y, true);
  polygon = clip(polygon, "y", bounds.y + bounds.height, false);
  if (polygon.length < 3) return [];
  // Triangulate around one vertex to avoid cancellation at large canvas offsets.
  const origin = polygon[0];
  let area = 0;
  for (let k = 1; k < polygon.length - 1; k++) {
    const a = polygon[k], b = polygon[k + 1];
    area += (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
  }
  return area === 0 ? [] : polygon;
}

// A scene edge cannot close an empty region. A single touching vertex is not an opening.
function touchesBoundary(polygon: Point[], bounds: FillBounds): boolean {
  return polygon.some((a, index) => {
    const b = polygon[(index + 1) % polygon.length];
    if (a.x === b.x && a.y !== b.y) return a.x === bounds.x || a.x === bounds.x + bounds.width;
    if (a.y === b.y && a.x !== b.x) return a.y === bounds.y || a.y === bounds.y + bounds.height;
    return false;
  });
}

// One connected source color becomes one batch. Empty regions must be enclosed by paint.
export function floodFill(cells: CellChanges, seed: Offset, color: string, grid: FillGrid, bounds: FillBounds): FillResult {
  if (bounds.width <= 0 || bounds.height <= 0) return { status: "noop" };
  const source = normalized(cells[keyOf(seed)]);
  if (source === normalized(color)) return { status: "noop" };
  const [i0, j0, i1, j1] = grid.getOffsetRange(bounds);
  const withinRange = ({ i, j }: Offset): boolean => i >= i0 && i < i1 && j >= j0 && j < j1;
  if (!withinRange(seed)) return { status: "noop" };

  const changes: CellChanges = {};
  const seen = new Set<string>([keyOf(seed)]);
  const pending = [seed];
  while (pending.length) {
    const offset = pending.pop()!;
    const key = keyOf(offset);
    if (normalized(cells[key]) !== source) continue;
    const polygon = inScene(grid.getVertices(offset), bounds);
    if (!polygon.length) continue;
    if (source === null && touchesBoundary(polygon, bounds)) return { status: "open" };
    changes[key] = color;

    for (const neighbor of grid.getAdjacentOffsets(offset)) {
      if (grid.isSquare && Math.abs(neighbor.i - offset.i) + Math.abs(neighbor.j - offset.j) !== 1) continue;
      const neighborKey = keyOf(neighbor);
      if (seen.has(neighborKey) || !withinRange(neighbor)) continue;
      seen.add(neighborKey);
      pending.push(neighbor);
    }
  }
  return Object.keys(changes).length ? { status: "filled", changes } : { status: "noop" };
}
