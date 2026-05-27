import type { Mat3, Vec2 } from "../types";
import { mat3Mul, mat3Inverse } from "./mat3";

// Heckbert: maps the unit square (0,0),(1,0),(1,1),(0,1) onto quad q.
export function squareToQuad(q: [Vec2, Vec2, Vec2, Vec2]): Mat3 {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;

  if (Math.abs(sx) < 1e-12 && Math.abs(sy) < 1e-12) {
    // Affine map.
    return [
      p1.x - p0.x, p3.x - p0.x, p0.x,
      p1.y - p0.y, p3.y - p0.y, p0.y,
      0, 0, 1,
    ];
  }

  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;

  return [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h, 1,
  ];
}

// Homography mapping src quad -> dst quad (both in TL,TR,BR,BL order).
export function solveHomography(
  src: [Vec2, Vec2, Vec2, Vec2],
  dst: [Vec2, Vec2, Vec2, Vec2],
): Mat3 {
  return mat3Mul(squareToQuad(dst), mat3Inverse(squareToQuad(src)));
}
