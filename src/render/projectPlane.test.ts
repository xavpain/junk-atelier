import { describe, it, expect } from "vitest";
import { projectPlane } from "./projectPlane";
import { mat3MulVec } from "../math/mat3";
import type { Bitmap, ViewerState } from "../types";

function baseState(): ViewerState {
  return {
    text: "x",
    objRotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    orbit: { yaw: 0, pitch: 0 },
    pan: { x: 0, y: 0 },
    zoom: 1,
    fov: Math.PI / 3,
    shape: "square",
    cellSize: 8,
    background: "#0a0a0a",
    transparent: true,
    thickness: 0,
    animate: false,
    animMode: "credits",
    animSpeed: 60,
  };
}

describe("projectPlane", () => {
  const bmp: Bitmap = { cols: 10, rows: 10, data: new Uint8Array(100) };

  it("identity transform yields a valid centered quad", () => {
    const q = projectPlane(bmp, baseState(), { width: 800, height: 600 });
    expect(q.valid).toBe(true);
    const cx = (q.corners[0].x + q.corners[2].x) / 2;
    const cy = (q.corners[0].y + q.corners[2].y) / 2;
    expect(cx).toBeCloseTo(400, 0);
    expect(cy).toBeCloseTo(300, 0);
  });

  it("inverse maps the screen center back to the source center", () => {
    const q = projectPlane(bmp, baseState(), { width: 800, height: 600 });
    const [u, v, w] = mat3MulVec(q.inverse, 400, 300);
    expect(u / w).toBeCloseTo(5, 1); // cols/2
    expect(v / w).toBeCloseTo(5, 1); // rows/2
  });
});
