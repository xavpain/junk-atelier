import { describe, it, expect } from "vitest";
import { squareToQuad, solveHomography } from "./homography";
import { mat3MulVec } from "./mat3";
import type { Vec2 } from "../types";

const UNIT: [Vec2, Vec2, Vec2, Vec2] = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
];

describe("homography", () => {
  it("squareToQuad of the unit square is identity", () => {
    const h = squareToQuad(UNIT);
    const id = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let i = 0; i < 9; i++) expect(h[i]).toBeCloseTo(id[i]);
  });

  it("solveHomography maps a scaled square correctly", () => {
    const src: [Vec2, Vec2, Vec2, Vec2] = [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 },
    ];
    const dst: [Vec2, Vec2, Vec2, Vec2] = [
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 },
    ];
    const h = solveHomography(src, dst);
    const [x, y, w] = mat3MulVec(h, 1, 1); // center of src -> center of dst
    expect(x / w).toBeCloseTo(2);
    expect(y / w).toBeCloseTo(2);
  });
});
