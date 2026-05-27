import { describe, it, expect } from "vitest";
import { thresholdAlpha } from "./threshold";

describe("thresholdAlpha", () => {
  it("marks cells on where alpha exceeds the threshold", () => {
    // 2x2 image, RGBA. Alpha at indices 3,7,11,15.
    const rgba = new Uint8ClampedArray(16);
    rgba[3] = 200;  // (0,0) on
    rgba[7] = 10;   // (1,0) off
    rgba[11] = 10;  // (0,1) off
    rgba[15] = 200; // (1,1) on
    const bmp = thresholdAlpha(rgba, 2, 2, 128);
    expect(bmp.cols).toBe(2);
    expect(bmp.rows).toBe(2);
    expect(Array.from(bmp.data)).toEqual([1, 0, 0, 1]);
  });
});
