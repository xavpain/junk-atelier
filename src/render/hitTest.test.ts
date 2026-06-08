import { describe, it, expect } from "vitest";
import { hitPane, pickPane } from "./hitTest";
import { projectPlane } from "./projectPlane";
import { defaultPane, defaultCamera } from "../state/store";
import type { Bitmap } from "../types";

const bmp: Bitmap = { cols: 10, rows: 10, data: new Uint8Array(100) };
const vp = { width: 800, height: 600 };

describe("hitTest", () => {
  it("hits inside the centred pane, misses the corner", () => {
    const q = projectPlane(bmp, defaultPane("a"), defaultCamera(), vp);
    expect(hitPane(q, bmp, 400, 300)).toBe(true);
    expect(hitPane(q, bmp, 5, 5)).toBe(false);
  });

  it("pickPane returns the front-most pane at a point", () => {
    const back = projectPlane(bmp, defaultPane("back"), defaultCamera(), vp);
    const front = projectPlane(bmp, { ...defaultPane("front"), position: { x: 0, y: 0, z: 4 } }, defaultCamera(), vp);
    const quads = [back, front];
    const bms = [bmp, bmp];
    const order = [0, 1].sort((a, b) => quads[b].meanDepth - quads[a].meanDepth); // far->near
    const idx = pickPane(order, quads, bms, 400, 300);
    expect(idx).toBe(1); // the nearer (front) pane wins
  });
});
