import { describe, it, expect } from "vitest";
import { morph } from "./rasterizeText";
import type { Bitmap } from "../types";

// 5x5 grid with a single centre pixel on.
function dot(): Bitmap {
  const data = new Uint8Array(25);
  data[2 * 5 + 2] = 1;
  return { cols: 5, rows: 5, data };
}

describe("morph", () => {
  it("dilates a single pixel into a 3x3 block, padding to avoid clipping", () => {
    const out = morph(dot(), 1);
    expect(out.cols).toBe(7); // 5 + pad*2
    expect(out.rows).toBe(7);
    const on = [...out.data].filter((v) => v === 1).length;
    expect(on).toBe(9); // 3x3 around the centre
  });

  it("erodes an isolated pixel to nothing", () => {
    const out = morph(dot(), -1);
    expect(out.cols).toBe(5); // no padding on erode
    expect([...out.data].every((v) => v === 0)).toBe(true);
  });

  it("erode keeps the interior of a solid block", () => {
    const data = new Uint8Array(25).fill(1);
    const out = morph({ cols: 5, rows: 5, data }, -1);
    const on = [...out.data].filter((v) => v === 1).length;
    expect(on).toBe(9); // 5x5 shrinks to inner 3x3
  });
});
