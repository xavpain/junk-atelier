import { describe, it, expect } from "vitest";
import { repixelate } from "./repixelate";
import { solveHomography } from "../math/homography";
import { mat3Inverse } from "../math/mat3";
import type { Bitmap, ProjectedQuad, Vec2 } from "../types";

describe("repixelate", () => {
  it("returns live cells matching an on/off bitmap under a 1:1-ish map", () => {
    const bmp: Bitmap = { cols: 2, rows: 2, data: new Uint8Array([1, 0, 0, 1]) };
    const src: [Vec2, Vec2, Vec2, Vec2] = [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 },
    ];
    const dst: [Vec2, Vec2, Vec2, Vec2] = [
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
    ];
    const homography = solveHomography(src, dst);
    const quad: ProjectedQuad = {
      corners: dst, homography, inverse: mat3Inverse(homography), meanDepth: 1, valid: true,
    };
    const cells = repixelate(bmp, quad, { width: 20, height: 20 }, 10);
    const set = cells.map((c) => `${c.sx},${c.sy}`).sort();
    expect(set).toEqual(["0,0", "10,10"]);
  });

  it("returns nothing for an invalid quad", () => {
    const bmp: Bitmap = { cols: 2, rows: 2, data: new Uint8Array([1, 1, 1, 1]) };
    const quad: ProjectedQuad = {
      corners: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
      homography: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      meanDepth: Infinity,
      valid: false,
    };
    expect(repixelate(bmp, quad, { width: 20, height: 20 }, 10)).toEqual([]);
  });
});
