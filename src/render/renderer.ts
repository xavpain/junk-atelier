import type { Bitmap, Scene, Pane, ProjectedQuad } from "../types";
import { projectPlane } from "./projectPlane";
import { repixelate } from "./repixelate";
import { drawPaneCells } from "./drawShapes";
import { drawBackground } from "./background";
import { pickPane } from "./hitTest";

export interface Renderer {
  setScene(scene: Scene): void;
  setBitmaps(map: Map<string, Bitmap>): void;
  resize(): void;
  markDirty(): void;
  pickAt(x: number, y: number): string | null; // pane id or null
}

const EMPTY_BITMAP: Bitmap = { cols: 0, rows: 0, data: new Uint8Array(0) };
const HIGHLIGHT = "#4ade80";
const TAU = Math.PI * 2;

// Returns a copy of the pane with float (position) and sway (rotation) motion
// applied for time ts (ms). Pure; does not mutate the source pane.
function animatedPane(p: Pane, ts: number): Pane {
  if (!p.floatEnabled && !p.swayEnabled) return p;
  const position = { ...p.position };
  const rotation = { ...p.rotation };
  if (p.floatEnabled) {
    position[p.floatAxis] += p.floatAmp * Math.sin(ts * 0.001 * TAU * p.floatSpeed);
  }
  if (p.swayEnabled) {
    rotation[p.swayAxis] += p.swayAmp * Math.sin(ts * 0.001 * TAU * p.swaySpeed);
  }
  return { ...p, position, rotation };
}

// Render at CSS-pixel resolution (device px == CSS px) to keep the blocky grid.
const DPR = 1;

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d")!;
  let scene: Scene | null = null;
  let bitmaps = new Map<string, Bitmap>();
  let dirty = true;
  let cssW = 0, cssH = 0;
  let lastTs = 0;
  const scrollPx = new Map<string, number>();

  // Last-frame projection cache (for hit-testing without reprojecting).
  let lastQuads: ProjectedQuad[] = [];
  let lastBitmaps: Bitmap[] = [];
  let lastOrder: number[] = [];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    cssW = rect.width; cssH = rect.height;
    canvas.width = Math.round(rect.width * DPR);
    canvas.height = Math.round(rect.height * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dirty = true;
  }

  function bmp(id: string): Bitmap {
    return bitmaps.get(id) ?? EMPTY_BITMAP;
  }

  function frame(ts: number) {
    const animating = !!scene && (scene.background.fade ||
      scene.panes.some((p) => p.animate || p.floatEnabled || p.swayEnabled));
    if (scene) {
      const dt = lastTs ? ts - lastTs : 0;
      for (const p of scene.panes) {
        if (p.animate) {
          scrollPx.set(p.id, (scrollPx.get(p.id) ?? 0) + (p.animSpeed * p.animDir * dt) / 1000);
        }
      }
      if (animating) dirty = true;
    }
    lastTs = ts;

    if (dirty && scene) {
      dirty = false;
      const vp = { width: cssW, height: cssH };
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawBackground(ctx, scene.background, vp, ts);

      // Apply per-pane motion, project, then sort far->near for painter's blend.
      const moved = scene.panes.map((p) => animatedPane(p, ts));
      const quads = moved.map((p) => projectPlane(bmp(p.id), p, scene!.camera, vp));
      const bms = scene.panes.map((p) => bmp(p.id));
      const order = quads
        .map((_, i) => i)
        .filter((i) => quads[i].valid)
        .sort((a, b) => quads[b].meanDepth - quads[a].meanDepth);

      for (const i of order) {
        const p = scene.panes[i];
        if (p.card) drawCard(quads[i], p);
        const off = Math.round(scrollPx.get(p.id) ?? 0);
        const scroll = p.animate
          ? p.animMode === "credits" ? { du: 0, dv: off } : { du: off, dv: 0 }
          : undefined;
        const cells = repixelate(bms[i], quads[i], vp, p.cellSize, scroll);
        drawPaneCells(ctx, cells, p, quads[i], p.cellSize);
      }

      // Selection outline on top.
      const sel = scene.panes.findIndex((p) => p.id === scene!.selectedId);
      if (sel >= 0 && quads[sel].valid) outline(quads[sel]);

      lastQuads = quads; lastBitmaps = bms; lastOrder = order;
    }
    requestAnimationFrame(frame);
  }

  function drawCard(q: ProjectedQuad, p: Pane) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.cardAlpha));
    ctx.fillStyle = p.cardColor;
    ctx.beginPath();
    ctx.moveTo(q.corners[0].x, q.corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(q.corners[i].x, q.corners[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function outline(q: ProjectedQuad) {
    ctx.save();
    ctx.strokeStyle = HIGHLIGHT;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(q.corners[0].x, q.corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(q.corners[i].x, q.corners[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  resize();
  requestAnimationFrame(frame);

  return {
    setScene(s) { scene = s; dirty = true; },
    setBitmaps(m) { bitmaps = m; dirty = true; },
    resize,
    markDirty() { dirty = true; },
    pickAt(x, y) {
      if (!scene) return null;
      const idx = pickPane(lastOrder, lastQuads, lastBitmaps, x, y);
      return idx >= 0 ? scene.panes[idx].id : null;
    },
  };
}
