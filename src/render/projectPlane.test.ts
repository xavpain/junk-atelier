import { describe, it, expect } from "vitest";
import { projectPlane } from "./projectPlane";
import { mat3MulVec } from "../math/mat3";
import { defaultPane, defaultCamera } from "../state/store";
import type { Bitmap, Pane, Camera } from "../types";

const cam: Camera = defaultCamera();
function pane(over: Partial<Pane> = {}): Pane {
  return { ...defaultPane("t", "x"), ...over };
}

describe("projectPlane", () => {
  const bmp: Bitmap = { cols: 10, rows: 10, data: new Uint8Array(100) };
  const vp = { width: 800, height: 600 };

  it("identity transform yields a valid centered quad", () => {
    const q = projectPlane(bmp, pane(), cam, vp);
    expect(q.valid).toBe(true);
    const cx = (q.corners[0].x + q.corners[2].x) / 2;
    const cy = (q.corners[0].y + q.corners[2].y) / 2;
    expect(cx).toBeCloseTo(400, 0);
    expect(cy).toBeCloseTo(300, 0);
  });

  it("inverse maps the screen center back to the source center", () => {
    const q = projectPlane(bmp, pane(), cam, vp);
    const [u, v, w] = mat3MulVec(q.inverse, 400, 300);
    expect(u / w).toBeCloseTo(5, 1); // cols/2
    expect(v / w).toBeCloseTo(5, 1); // rows/2
  });

  it("a pane pushed back (-z) has greater meanDepth than one pulled forward", () => {
    const back = projectPlane(bmp, pane({ position: { x: 0, y: 0, z: -5 } }), cam, vp);
    const front = projectPlane(bmp, pane({ position: { x: 0, y: 0, z: 5 } }), cam, vp);
    expect(back.meanDepth).toBeGreaterThan(front.meanDepth);
  });

  it("skew shifts the quad into a parallelogram", () => {
    const q = projectPlane(bmp, pane({ skew: { x: 0.5, y: 0 } }), cam, vp);
    // Top edge and bottom edge are no longer vertically aligned at the corners.
    const topDx = q.corners[1].x - q.corners[0].x;
    const botDx = q.corners[2].x - q.corners[3].x;
    expect(topDx).toBeCloseTo(botDx, 1); // edges stay parallel
    // x of TL differs from BL (sheared).
    expect(q.corners[0].x).not.toBeCloseTo(q.corners[3].x, 1);
  });
});
