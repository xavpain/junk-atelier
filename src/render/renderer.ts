import type { Bitmap, ViewerState } from "../types";
import { projectPlane } from "./projectPlane";
import { repixelate } from "./repixelate";
import { drawCells } from "./drawShapes";

export interface Renderer {
  setBitmap(bmp: Bitmap): void;
  setState(state: ViewerState): void;
  resize(): void;
  markDirty(): void;
}

// Render at CSS-pixel resolution (device px == CSS px). The fixed pixel grid
// is intentionally blocky, so we do not upscale for high-DPR displays; this
// keeps repixelate cells and the ImageData buffer in one coordinate space.
const DPR = 1;

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d")!;
  let bitmap: Bitmap = { cols: 0, rows: 0, data: new Uint8Array(0) };
  let state: ViewerState | null = null;
  let dirty = true;
  let cssW = 0, cssH = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    cssW = rect.width; cssH = rect.height;
    canvas.width = Math.round(rect.width * DPR);
    canvas.height = Math.round(rect.height * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dirty = true;
  }

  function frame() {
    if (dirty && state) {
      dirty = false;
      const quad = projectPlane(bitmap, state, { width: cssW, height: cssH });
      const cells = repixelate(bitmap, quad, { width: cssW, height: cssH }, state.cellSize);
      drawCells(ctx, cells, state.cellSize, state.shape);
    }
    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);

  return {
    setBitmap(b) { bitmap = b; dirty = true; },
    setState(s) { state = s; dirty = true; },
    resize,
    markDirty() { dirty = true; },
  };
}
