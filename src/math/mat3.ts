import type { Mat3 } from "../types";

export function mat3Identity(): Mat3 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += a[row * 3 + k] * b[k * 3 + col];
      r[row * 3 + col] = sum;
    }
  }
  return r;
}

// Returns homogeneous [x', y', w'] (caller divides by w' for screen coords).
export function mat3MulVec(m: Mat3, x: number, y: number, w = 1): [number, number, number] {
  return [
    m[0] * x + m[1] * y + m[2] * w,
    m[3] * x + m[4] * y + m[5] * w,
    m[6] * x + m[7] * y + m[8] * w,
  ];
}

export function mat3Inverse(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error("mat3Inverse: singular matrix");
  const invDet = 1 / det;
  return [
    A * invDet,                 (c * h - b * i) * invDet, (b * f - c * e) * invDet,
    B * invDet,                 (a * i - c * g) * invDet, (c * d - a * f) * invDet,
    C * invDet,                 (b * g - a * h) * invDet, (a * e - b * d) * invDet,
  ];
}
