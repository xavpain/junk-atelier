import type { Bitmap, ColorBitmap, ProjectedQuad } from "../types";

// Hot-loop output buffers. Both samplers run once per pane per frame over up to
// ~90k grid cells, so they write into persistent pooled typed arrays instead of
// allocating per-cell objects. Each result is valid only until the same sampler
// runs again (the renderer draws each pane's cells before sampling the next).

// Flat [sx0, sy0, sx1, sy1, ...] screen-px cell origins + how many pairs are live.
export interface CellBuffer { xy: Float64Array; count: number; }

// Grid-space RGBA patch covering the projected quad's AABB: `data` is
// cols*rows*4 bytes (transparent where no cell), positioned at grid cell
// (gx0, gy0). Drawn by blitting once and scaling up by cellSize.
export interface ColorCellGrid {
  data: Uint8ClampedArray;
  cols: number;
  rows: number;
  gx0: number;
  gy0: number;
  count: number;
}

let xyPool = new Float64Array(8192);
let rgbaPool = new Uint8ClampedArray(0);

// Grid-space AABB of the quad clamped to the viewport: [gx0, gy0, gx1, gy1).
function gridBounds(
  quad: ProjectedQuad,
  viewport: { width: number; height: number },
  cellSize: number,
): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of quad.corners) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  }
  return [
    Math.max(0, Math.floor(minX / cellSize)),
    Math.max(0, Math.floor(minY / cellSize)),
    Math.min(Math.ceil(viewport.width / cellSize), Math.ceil(maxX / cellSize)),
    Math.min(Math.ceil(viewport.height / cellSize), Math.ceil(maxY / cellSize)),
  ];
}

// scroll offsets the sampled source coord and wraps modulo the bitmap, so the
// content loops continuously through the static plane (teleprompter effect).
export function repixelate(
  bitmap: Bitmap,
  quad: ProjectedQuad,
  viewport: { width: number; height: number },
  cellSize: number,
  scroll?: { du: number; dv: number },
): CellBuffer {
  if (!quad.valid || bitmap.cols === 0 || bitmap.rows === 0) {
    return { xy: xyPool, count: 0 };
  }

  const [gx0, gy0, gx1, gy1] = gridBounds(quad, viewport, cellSize);
  const maxCells = Math.max(0, gx1 - gx0) * Math.max(0, gy1 - gy0);
  if (xyPool.length < maxCells * 2) {
    let cap = xyPool.length || 8192;
    while (cap < maxCells * 2) cap *= 2;
    xyPool = new Float64Array(cap);
  }

  const { cols, rows, data } = bitmap;
  // quad.inverse is constant across the loop; hoisting its elements avoids a
  // per-cell mat3MulVec call (and its tuple allocation) in the hottest loop.
  const m = quad.inverse;
  const m0 = m[0], m1 = m[1], m2 = m[2];
  const m3 = m[3], m4 = m[4], m5 = m[5];
  const m6 = m[6], m7 = m[7], m8 = m[8];
  const half = cellSize / 2;

  let n = 0;
  for (let gy = gy0; gy < gy1; gy++) {
    for (let gx = gx0; gx < gx1; gx++) {
      const cx = gx * cellSize + half;
      const cy = gy * cellSize + half;
      const hw = m6 * cx + m7 * cy + m8;
      const u = (m0 * cx + m1 * cy + m2) / hw;
      const v = (m3 * cx + m4 * cy + m5) / hw;
      if (u < 0 || v < 0 || u >= cols || v >= rows) continue;
      let col: number, row: number;
      if (scroll) {
        col = (((Math.floor(u) + scroll.du) % cols) + cols) % cols;
        row = (((Math.floor(v) + scroll.dv) % rows) + rows) % rows;
      } else {
        col = Math.floor(u); row = Math.floor(v);
      }
      if (data[row * cols + col] === 1) {
        xyPool[n * 2] = gx * cellSize;
        xyPool[n * 2 + 1] = gy * cellSize;
        n++;
      }
    }
  }
  return { xy: xyPool, count: n };
}

// Like repixelate, but samples colour from a media grid, writing straight into
// an RGBA patch (transparent where uncovered; near-transparent pixels skipped).
export function repixelateColor(
  cb: ColorBitmap,
  quad: ProjectedQuad,
  viewport: { width: number; height: number },
  cellSize: number,
): ColorCellGrid {
  if (!quad.valid || cb.cols === 0 || cb.rows === 0) {
    return { data: rgbaPool, cols: 0, rows: 0, gx0: 0, gy0: 0, count: 0 };
  }

  const [gx0, gy0, gx1, gy1] = gridBounds(quad, viewport, cellSize);
  const gw = Math.max(0, gx1 - gx0);
  const gh = Math.max(0, gy1 - gy0);
  const bytes = gw * gh * 4;
  if (rgbaPool.length < bytes) {
    let cap = rgbaPool.length || 4096;
    while (cap < bytes) cap *= 2;
    rgbaPool = new Uint8ClampedArray(cap);
  }
  rgbaPool.fill(0, 0, bytes);

  const { cols, rows, data } = cb;
  const m = quad.inverse;
  const m0 = m[0], m1 = m[1], m2 = m[2];
  const m3 = m[3], m4 = m[4], m5 = m[5];
  const m6 = m[6], m7 = m[7], m8 = m[8];
  const half = cellSize / 2;

  let n = 0;
  for (let gy = gy0; gy < gy1; gy++) {
    for (let gx = gx0; gx < gx1; gx++) {
      const cx = gx * cellSize + half;
      const cy = gy * cellSize + half;
      const hw = m6 * cx + m7 * cy + m8;
      const u = (m0 * cx + m1 * cy + m2) / hw;
      const v = (m3 * cx + m4 * cy + m5) / hw;
      if (u < 0 || v < 0 || u >= cols || v >= rows) continue;
      const i = (Math.floor(v) * cols + Math.floor(u)) * 4;
      const a = data[i + 3];
      if (a < 16) continue;
      const o = ((gy - gy0) * gw + (gx - gx0)) * 4;
      rgbaPool[o] = data[i];
      rgbaPool[o + 1] = data[i + 1];
      rgbaPool[o + 2] = data[i + 2];
      rgbaPool[o + 3] = a;
      n++;
    }
  }
  return { data: rgbaPool, cols: gw, rows: gh, gx0, gy0, count: n };
}
