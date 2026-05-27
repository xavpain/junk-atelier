import { describe, it, expect } from "vitest";
import { rotateX, rotateY, rotateZ } from "./transform3d";

describe("rotations", () => {
  const HALF_PI = Math.PI / 2;

  it("rotateX(90deg) maps +Y to +Z", () => {
    const p = rotateX({ x: 0, y: 1, z: 0 }, HALF_PI);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(1);
  });

  it("rotateY(90deg) maps +X to -Z", () => {
    const p = rotateY({ x: 1, y: 0, z: 0 }, HALF_PI);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-1);
  });

  it("rotateZ(90deg) maps +X to +Y", () => {
    const p = rotateZ({ x: 1, y: 0, z: 0 }, HALF_PI);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });
});
