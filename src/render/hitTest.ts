import type { Bitmap, ProjectedQuad } from "../types";
import { mat3MulVec } from "../math/mat3";

// True if screen point (x,y) maps inside the pane's source rectangle.
export function hitPane(quad: ProjectedQuad, bitmap: Bitmap, x: number, y: number): boolean {
  if (!quad.valid || bitmap.cols === 0 || bitmap.rows === 0) return false;
  const [hx, hy, hw] = mat3MulVec(quad.inverse, x, y);
  const u = hx / hw, v = hy / hw;
  return u >= 0 && v >= 0 && u < bitmap.cols && v < bitmap.rows;
}

// Returns the index of the front-most pane hit at (x,y), or -1.
// `panes` must be paired quads+bitmaps in the same order; `order` lists indices
// already sorted far->near, so we scan it in reverse (near first).
export function pickPane(
  order: number[],
  quads: ProjectedQuad[],
  bitmaps: Bitmap[],
  x: number,
  y: number,
): number {
  for (let i = order.length - 1; i >= 0; i--) {
    const idx = order[i];
    if (hitPane(quads[idx], bitmaps[idx], x, y)) return idx;
  }
  return -1;
}
