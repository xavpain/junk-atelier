import type { Bitmap } from "../types";

export function thresholdAlpha(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 128,
): Bitmap {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    data[i] = rgba[i * 4 + 3] > threshold ? 1 : 0;
  }
  return { cols: width, rows: height, data };
}
