import { describe, it, expect } from "vitest";
import { rotateX, rotateY, rotateZ, translate, shear } from "./transform3d";

describe("translate/shear", () => {
  it("translate adds component-wise", () => {
    const p = translate({ x: 1, y: 2, z: 3 }, { x: 10, y: 20, z: 30 });
    expect(p).toEqual({ x: 11, y: 22, z: 33 });
  });

  it("shear kx shifts x by y, leaves y", () => {
    const p = shear({ x: 0, y: 2, z: 0 }, 0.5, 0);
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(2);
  });

  it("shear ky shifts y by x", () => {
    const p = shear({ x: 4, y: 0, z: 0 }, 0, 0.25);
    expect(p.y).toBeCloseTo(1);
  });
});

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
