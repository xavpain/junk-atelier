import { describe, it, expect } from "vitest";
import { repixelate, repixelateColor } from "./repixelate";
import { solveHomography } from "../math/homography";
import { mat3Inverse } from "../math/mat3";
import type { Bitmap, ColorBitmap, ProjectedQuad, Vec2 } from "../types";

function quad2to20(): ProjectedQuad {
  const src: [Vec2, Vec2, Vec2, Vec2] = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
  const dst: [Vec2, Vec2, Vec2, Vec2] = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
  const h = solveHomography(src, dst);
  return { corners: dst, homography: h, inverse: mat3Inverse(h), meanDepth: 1, valid: true };
}

describe("repixelateColor", () => {
  it("emits one coloured cell per opaque source pixel, skips transparent", () => {
    // 2x2: (0,0) red, (1,0) transparent, (0,1) green, (1,1) blue.
    const data = new Uint8ClampedArray([
      255, 0, 0, 255,  0, 0, 0, 0,
      0, 255, 0, 255,  0, 0, 255, 255,
    ]);
    const cb: ColorBitmap = { cols: 2, rows: 2, data, dynamic: false };
    const cells = repixelateColor(cb, quad2to20(), { width: 20, height: 20 }, 10);
    expect(cells).toHaveLength(3); // transparent pixel dropped
    const at = (x: number, y: number) => cells.find((c) => c.sx === x && c.sy === y);
    expect(at(0, 0)).toMatchObject({ r: 255, g: 0, b: 0 });
    expect(at(0, 10)).toMatchObject({ r: 0, g: 255, b: 0 });
    expect(at(10, 10)).toMatchObject({ r: 0, g: 0, b: 255 });
    expect(at(10, 0)).toBeUndefined();
  });
});

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
