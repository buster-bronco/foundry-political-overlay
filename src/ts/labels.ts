import { CONSTANTS } from "./constants";
import { colorKey } from "./overlay";
import type { CellMap } from "./types";

export interface Point {
  x: number;
  y: number;
}

// one connected region of a single color
export interface Blob {
  key: string;
  color: string;
  points: Point[];
}

// quadratic y = a*x² + b*x + c in a frame rotated by angle around origin
export interface LabelLayout {
  angle: number;
  origin: Point;
  a: number;
  b: number;
  c: number;
  // text start and end along the frame x axis
  x0: number;
  x1: number;
  fontSize: number;
  // extra gap between letters in world px
  spacing: number;
  // text length along the curve in world px
  length: number;
  // fitted slope at the middle, relative to the frame
  slope: number;
}

interface Run {
  lo: number;
  hi: number;
}

interface Slice {
  x: number;
  mid: number;
  thick: number;
}

const parseKey = (key: string) => {
  const [i, j] = key.split(",").map(Number);
  return { i, j };
};

// cell step is the distance between neighbouring cell centers
export const cellStep = (grid: foundry.grid.BaseGrid): number => Math.min(grid.sizeX, grid.sizeY);

// same-color cells within the gap window join one blob
export function findBlobs(cells: CellMap, gap: number, grid: foundry.grid.BaseGrid): Blob[] {
  const reach = (gap + 1) * cellStep(grid) * CONSTANTS.LABEL_JOIN_FACTOR;
  // offset search box; hex rows are staggered so it's padded
  const box = (gap + 1) * 2;
  const byColor = new Map<string, Map<string, Point>>();
  for (const [key, color] of Object.entries(cells)) {
    if (!color) continue;
    const ck = colorKey(color);
    if (!byColor.has(ck)) byColor.set(ck, new Map());
    const c = grid.getCenterPoint(parseKey(key));
    byColor.get(ck)!.set(key, { x: c.x, y: c.y });
  }

  const blobs: Blob[] = [];
  for (const [ck, centers] of byColor) {
    const seen = new Set<string>();
    for (const start of centers.keys()) {
      if (seen.has(start)) continue;
      seen.add(start);
      const points: Point[] = [];
      const queue = [start];
      // bfs over cells in reach of each other
      while (queue.length) {
        const key = queue.pop()!;
        const p = centers.get(key)!;
        points.push(p);
        const { i, j } = parseKey(key);
        for (let di = -box; di <= box; di++) {
          for (let dj = -box; dj <= box; dj++) {
            const nk = `${i + di},${j + dj}`;
            if (seen.has(nk)) continue;
            const q = centers.get(nk);
            if (!q || Math.hypot(q.x - p.x, q.y - p.y) > reach) continue;
            seen.add(nk);
            queue.push(nk);
          }
        }
      }
      blobs.push({ key: ck, color: `#${ck}`, points });
    }
  }
  return blobs;
}

// splits sorted values wherever the step exceeds maxGap
function runsOf(ys: number[], maxGap: number): Run[] {
  ys.sort((a, b) => a - b);
  const runs: Run[] = [];
  let lo = ys[0];
  for (let k = 1; k <= ys.length; k++) {
    if (k === ys.length || ys[k] - ys[k - 1] > maxGap) {
      runs.push({ lo, hi: ys[k - 1] });
      lo = ys[k];
    }
  }
  return runs;
}

// longest chain of overlapping runs across slices of the rotated blob
function centerline(pts: Point[], step: number, gap: number): Slice[] {
  let minX = Infinity;
  for (const p of pts) minX = Math.min(minX, p.x);
  const bins: number[][] = [];
  for (const p of pts) {
    const b = Math.floor((p.x - minX) / step);
    (bins[b] ??= []).push(p.y);
  }
  const maxGap = step * CONSTANTS.LABEL_RUN_GAP * (gap + 1);
  const runs: Run[][] = [];
  for (let b = 0; b < bins.length; b++) runs[b] = bins[b] ? runsOf(bins[b], maxGap) : [];

  // dp: best chain length ending at each run
  const pad = step / 2;
  const len: number[][] = [];
  const prev: ([number, number] | null)[][] = [];
  let best: [number, number] | null = null;
  let bestLen = 0;
  for (let b = 0; b < runs.length; b++) {
    len[b] = [];
    prev[b] = [];
    runs[b].forEach((r, k) => {
      len[b][k] = 1;
      prev[b][k] = null;
      // empty slices inside the gap window don't break the chain
      for (let pb = b - 1; pb >= Math.max(0, b - gap - 1); pb--) {
        runs[pb].forEach((q, pk) => {
          if (q.hi + pad < r.lo - pad || r.hi + pad < q.lo - pad) return;
          if (len[pb][pk] + 1 > len[b][k]) {
            len[b][k] = len[pb][pk] + 1;
            prev[b][k] = [pb, pk];
          }
        });
        if (runs[pb].length) break;
      }
      if (len[b][k] > bestLen) {
        bestLen = len[b][k];
        best = [b, k];
      }
    });
  }

  const chain: Slice[] = [];
  // best is set inside a closure, so ts narrows it to null
  for (let at = best as [number, number] | null; at; at = prev[at[0]][at[1]]) {
    const r = runs[at[0]][at[1]];
    chain.unshift({ x: minX + (at[0] + 0.5) * step, mid: (r.lo + r.hi) / 2, thick: r.hi - r.lo + step });
  }
  return chain;
}

const quantile = (values: number[], q: number): number => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

// least squares y = a*x² + b*x + c; falls back to a line then a constant
function fitQuadratic(xs: number[], ys: number[]): [number, number, number] {
  const n = xs.length;
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (let k = 0; k < n; k++) {
    const x = xs[k], y = ys[k], x2 = x * x;
    s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2;
    t0 += y; t1 += x * y; t2 += x2 * y;
  }
  const det3 = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const M = [[s4, s3, s2], [s3, s2, s1], [s2, s1, n]];
  const D = det3(M);
  if (n >= 3 && Math.abs(D) > 1e-9) {
    // cramer's rule on the normal equations
    const col = (k: number) => M.map((row, r) => row.map((v, c) => (c === k ? [t2, t1, t0][r] : v)));
    return [det3(col(0)) / D, det3(col(1)) / D, det3(col(2)) / D];
  }
  const d = n * s2 - s1 * s1;
  if (n >= 2 && Math.abs(d) > 1e-9) return [0, (n * t1 - s1 * t0) / d, (t0 * s2 - s1 * t1) / d];
  return [0, 0, t0 / n];
}

// advances are per-letter widths at font size 1
function layoutAt(blob: Blob, angle: number, advances: number[], step: number, gap: number): LabelLayout | null {
  const origin = blob.points[0];
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // rotate into the frame whose x axis is the reading direction
  const pts = blob.points.map((p) => {
    const dx = p.x - origin.x, dy = p.y - origin.y;
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  });
  let chain = centerline(pts, step, gap);
  if (!chain.length) return null;

  // drop thin tails at either end
  const floor = quantile(chain.map((s) => s.thick), 0.5) * CONSTANTS.LABEL_TAIL_TRIM;
  let lo = 0, hi = chain.length - 1;
  while (lo < hi && chain[lo].thick < floor) lo++;
  while (hi > lo && chain[hi].thick < floor) hi--;
  chain = chain.slice(lo, hi + 1);

  // fit around the chain middle so the curve stays well conditioned
  const cx = (chain[0].x + chain[chain.length - 1].x) / 2;
  const [fa, fb, fc] = fitQuadratic(chain.map((s) => s.x - cx), chain.map((s) => s.mid));
  // a sloped centerline is longer and thinner than the frame slices
  const tilt = Math.hypot(1, fb);

  const span = (chain[chain.length - 1].x - chain[0].x + step) * CONSTANTS.LABEL_FILL * tilt;
  const thick = quantile(chain.map((s) => s.thick), 0.25) / tilt;
  const textWidth = advances.reduce((a, b) => a + b, 0);
  const fontSize = Math.min(span / textWidth, thick * CONSTANTS.LABEL_THICK_FILL);

  // leftover length spreads the letters apart
  const gaps = Math.max(1, advances.length - 1);
  const spacing = advances.length > 1 ? Math.min((span - fontSize * textWidth) / gaps, fontSize * CONSTANTS.LABEL_MAX_SPREAD) : 0;
  const length = fontSize * textWidth + spacing * (advances.length - 1);

  // cap the bow height relative to the half length
  const half = length / 2 / tilt;
  const maxA = CONSTANTS.LABEL_MAX_CURVE / Math.max(half, 1);
  const a = Math.max(-maxA, Math.min(maxA, fa));
  // expand a(x-cx)² + b(x-cx) + c back to the frame origin
  const b = fb - 2 * a * cx;
  const c = a * cx * cx - fb * cx + fc;

  return { angle, origin, a, b, c, x0: cx - half, x1: cx + half, fontSize, spacing, length, slope: fb };
}

// every sample along the curve must sit near a cell of the blob
function insideBlob(blob: Blob, layout: LabelLayout, step: number, gap: number): boolean {
  const reach = step * (gap + 1) * CONSTANTS.LABEL_JOIN_FACTOR * 0.5;
  for (let k = 0; k <= CONSTANTS.LABEL_SAMPLES; k++) {
    const p = curveAt(layout, layout.x0 + ((layout.x1 - layout.x0) * k) / CONSTANTS.LABEL_SAMPLES);
    if (!blob.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= reach)) return false;
  }
  return true;
}

// tries a fan of angles and keeps the one with the largest font
export function layoutLabel(blob: Blob, advances: number[], step: number, gap: number): LabelLayout | null {
  if (!advances.length) return null;
  let best: LabelLayout | null = null;
  let bestScore = 0;
  const n = CONSTANTS.LABEL_ANGLES;
  for (let k = 0; k < n; k++) {
    // -90° to 90° keeps text reading left to right
    const angle = -Math.PI / 2 + (Math.PI * (k + 0.5)) / n;
    const layout = layoutAt(blob, angle, advances, step, gap);
    if (!layout) continue;
    // real text direction once the fitted slope is added
    const heading = angle + Math.atan(layout.slope);
    if (Math.abs(heading) > Math.PI / 2 || !insideBlob(blob, layout, step, gap)) continue;
    // bias toward horizontal text and frames aligned with the text
    const score =
      (layout.fontSize * (1 - CONSTANTS.LABEL_TILT_PENALTY * Math.abs(Math.sin(heading)))) /
      (1 + CONSTANTS.LABEL_SLOPE_PENALTY * layout.slope * layout.slope);
    if (score > bestScore) {
      bestScore = score;
      best = layout;
    }
  }
  return best;
}

// world position and tangent angle at frame x
export function curveAt(l: LabelLayout, x: number): { x: number; y: number; rotation: number } {
  const y = l.a * x * x + l.b * x + l.c;
  const slope = 2 * l.a * x + l.b;
  const cos = Math.cos(l.angle), sin = Math.sin(l.angle);
  return {
    x: l.origin.x + x * cos - y * sin,
    y: l.origin.y + x * sin + y * cos,
    rotation: l.angle + Math.atan(slope),
  };
}
