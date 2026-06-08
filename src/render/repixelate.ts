import type { Bitmap, ColorBitmap, ProjectedQuad } from "../types";
import { mat3MulVec } from "../math/mat3";

export interface LiveCell { sx: number; sy: number; } // top-left screen px
export interface ColorCell { sx: number; sy: number; r: number; g: number; b: number; a: number; }

// scroll offsets the sampled source coord and wraps modulo the bitmap, so the
// content loops continuously through the static plane (teleprompter effect).
export function repixelate(
  bitmap: Bitmap,
  quad: ProjectedQuad,
  viewport: { width: number; height: number },
  cellSize: number,
  scroll?: { du: number; dv: number },
): LiveCell[] {
  if (!quad.valid || bitmap.cols === 0 || bitmap.rows === 0) return [];

  // Screen-space AABB of the projected quad, clamped to the viewport and snapped to the grid.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of quad.corners) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  }
  const gx0 = Math.max(0, Math.floor(minX / cellSize));
  const gy0 = Math.max(0, Math.floor(minY / cellSize));
  const gx1 = Math.min(Math.ceil(viewport.width / cellSize), Math.ceil(maxX / cellSize));
  const gy1 = Math.min(Math.ceil(viewport.height / cellSize), Math.ceil(maxY / cellSize));

  const cells: LiveCell[] = [];
  const { cols, rows, data } = bitmap;
  for (let gy = gy0; gy < gy1; gy++) {
    for (let gx = gx0; gx < gx1; gx++) {
      const cx = gx * cellSize + cellSize / 2;
      const cy = gy * cellSize + cellSize / 2;
      const [hx, hy, hw] = mat3MulVec(quad.inverse, cx, cy);
      const u = hx / hw, v = hy / hw;
      let col: number, row: number;
      if (scroll) {
        col = (((Math.floor(u) + scroll.du) % cols) + cols) % cols;
        row = (((Math.floor(v) + scroll.dv) % rows) + rows) % rows;
        if (u < 0 || v < 0 || u >= cols || v >= rows) continue;
      } else {
        if (u < 0 || v < 0 || u >= cols || v >= rows) continue;
        col = Math.floor(u); row = Math.floor(v);
      }
      if (data[row * cols + col] === 1) {
        cells.push({ sx: gx * cellSize, sy: gy * cellSize });
      }
    }
  }
  return cells;
}

// Like repixelate, but samples colour from a media grid; one cell per covered
// grid square, skipping near-transparent pixels.
export function repixelateColor(
  cb: ColorBitmap,
  quad: ProjectedQuad,
  viewport: { width: number; height: number },
  cellSize: number,
): ColorCell[] {
  if (!quad.valid || cb.cols === 0 || cb.rows === 0) return [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of quad.corners) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  }
  const gx0 = Math.max(0, Math.floor(minX / cellSize));
  const gy0 = Math.max(0, Math.floor(minY / cellSize));
  const gx1 = Math.min(Math.ceil(viewport.width / cellSize), Math.ceil(maxX / cellSize));
  const gy1 = Math.min(Math.ceil(viewport.height / cellSize), Math.ceil(maxY / cellSize));

  const cells: ColorCell[] = [];
  const { cols, rows, data } = cb;
  for (let gy = gy0; gy < gy1; gy++) {
    for (let gx = gx0; gx < gx1; gx++) {
      const cx = gx * cellSize + cellSize / 2;
      const cy = gy * cellSize + cellSize / 2;
      const [hx, hy, hw] = mat3MulVec(quad.inverse, cx, cy);
      const u = hx / hw, v = hy / hw;
      if (u < 0 || v < 0 || u >= cols || v >= rows) continue;
      const i = (Math.floor(v) * cols + Math.floor(u)) * 4;
      const a = data[i + 3];
      if (a < 16) continue;
      cells.push({ sx: gx * cellSize, sy: gy * cellSize, r: data[i], g: data[i + 1], b: data[i + 2], a });
    }
  }
  return cells;
}
