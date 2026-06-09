import type { Bitmap, ColorBitmap, Scene, Pane, ProjectedQuad, Axis } from "../types";
import { projectPlane } from "./projectPlane";
import { repixelate, repixelateColor } from "./repixelate";
import { drawPaneCells, drawColorCells } from "./drawShapes";
import { drawBackground } from "./background";
import { pickPane } from "./hitTest";
import { worldToScreen } from "../math/transform3d";

export type MediaSampler = (paneId: string) => ColorBitmap | null;

// Screen-space unit direction of a gizmo axis + how many world units one screen
// pixel of drag along it equals (so controls can translate the pane).
export interface GizmoAxisVec { ux: number; uy: number; worldPerPx: number; }

export interface Renderer {
  setScene(scene: Scene): void;
  setBitmaps(map: Map<string, Bitmap>): void;
  setMediaSampler(fn: MediaSampler): void;
  resize(): void;
  markDirty(): void;
  clearMediaSample(paneId: string): void; // drop cached frame so re-imports resample
  // Render at an explicit pixel size with the gizmo hidden (for PNG/WebM export at
  // the chosen format resolution). endCapture restores the on-screen size.
  beginCapture(width: number, height: number): void;
  endCapture(): void;
  pickAt(x: number, y: number): string | null; // pane id or null
  pickGizmo(x: number, y: number): Axis | null; // gizmo axis under cursor, or null
  gizmoAxisVec(axis: Axis): GizmoAxisVec | null;
}

const EMPTY_BITMAP: Bitmap = { cols: 0, rows: 0, data: new Uint8Array(0) };
const TAU = Math.PI * 2;

// Move-gizmo geometry. Arrows extend GIZMO_LEN world units along each axis from
// the selected pane's origin; standard CAD colours (X red, Y green, Z blue).
const GIZMO_LEN = 3;
const GIZMO_HIT = 9; // px radius for grabbing an axis
const GIZMO_AXES: { axis: Axis; dir: [number, number, number]; color: string }[] = [
  { axis: "x", dir: [1, 0, 0], color: "#ff5b5b" },
  { axis: "y", dir: [0, 1, 0], color: "#4ade80" },
  { axis: "z", dir: [0, 0, 1], color: "#5b9bff" },
];

interface GizmoSeg { axis: Axis; ox: number; oy: number; ex: number; ey: number; ux: number; uy: number; worldPerPx: number; color: string; }

// Returns a copy of the pane with float (position) and sway (rotation) motion
// applied for time ts (ms). Pure; does not mutate the source pane.
// Pseudo-bitmap carrying only dimensions (data unused by projectPlane).
function sizeBitmap(cols: number, rows: number): Bitmap {
  return { cols, rows, data: new Uint8Array(0) };
}

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
  let mediaSampler: MediaSampler = () => null;
  const scrollPx = new Map<string, number>();
  const mediaCache = new Map<string, ColorBitmap>();

  // Static images sample once and cache; dynamic (video/gif) resample each call.
  function getSample(id: string): ColorBitmap | null {
    const c = mediaCache.get(id);
    if (c && !c.dynamic) return c;
    const s = mediaSampler(id);
    if (s) mediaCache.set(id, s);
    return s ?? c ?? null;
  }

  // Last-frame projection cache (for hit-testing without reprojecting).
  let lastQuads: ProjectedQuad[] = [];
  let lastBitmaps: Bitmap[] = [];
  let lastOrder: number[] = [];
  // Last-frame gizmo segments for the selected pane (for axis hit-testing).
  let gizmoSegs: GizmoSeg[] = [];
  let showOverlay = true; // gizmo is hidden while capturing PNG/WebM

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
      scene.panes.some((p) => p.animate || p.floatEnabled || p.swayEnabled ||
        (p.source === "media" && mediaCache.get(p.id)?.dynamic)));
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
    if (dirty && scene) paint(ts);
    requestAnimationFrame(frame);
  }

  function paint(ts: number) {
    if (!scene) return;
    dirty = false;
    const vp = { width: cssW, height: cssH };
    // Clear in draw-space (cssW/cssH) so it's correct under both the normal
    // transform and the scaled capture transform.
    ctx.clearRect(0, 0, cssW, cssH);
    drawBackground(ctx, scene.background, vp, ts);

    // Resolve each pane's source (text bitmap or sampled media grid), apply
    // motion, project, then sort far->near for painter's blend.
    const samples = scene.panes.map((p) => (p.source === "media" ? getSample(p.id) : null));
    const bms = scene.panes.map((p, i) =>
      p.source === "media"
        ? (samples[i] ? sizeBitmap(samples[i]!.cols, samples[i]!.rows) : EMPTY_BITMAP)
        : bmp(p.id));
    const moved = scene.panes.map((p) => animatedPane(p, ts));
    const quads = moved.map((p, i) => projectPlane(bms[i], p, scene!.camera, vp));
    const order = quads
      .map((_, i) => i)
      .filter((i) => quads[i].valid)
      .sort((a, b) => quads[b].meanDepth - quads[a].meanDepth);

    for (const i of order) {
      const p = scene.panes[i];
      if (p.card) drawCard(quads[i], p);
      if (p.source === "media") {
        // Clamp the effective cell size so a coarse-but-huge plane can't spawn
        // millions of fill ops (the cause of media import CPU spikes).
        if (samples[i]) {
          const cs = mediaCellSize(p.cellSize, quads[i]);
          drawColorCells(ctx, repixelateColor(samples[i]!, quads[i], vp, cs), p.alpha, cs);
        }
        continue;
      }
      const off = Math.round(scrollPx.get(p.id) ?? 0);
      const scroll = p.animate
        ? p.animMode === "credits" ? { du: 0, dv: off } : { du: off, dv: 0 }
        : undefined;
      const cells = repixelate(bms[i], quads[i], vp, p.cellSize, scroll);
      drawPaneCells(ctx, cells, p, quads[i], p.cellSize);
    }

    // Decorative per-pane border, painted in depth order with the panes.
    for (const i of order) {
      const p = scene.panes[i];
      if (p.outline) strokeQuad(quads[i], p.outlineColor, p.outlineWidth, 1);
    }

    // Move gizmo for the selected pane — overlay only, never baked into exports.
    if (showOverlay) drawGizmo(scene, vp);
    else gizmoSegs = [];

    lastQuads = quads; lastBitmaps = bms; lastOrder = order;
  }

  // Effective media cell size: never let one pane exceed MEDIA_CELL_CAP cells.
  const MEDIA_CELL_CAP = 90000;
  function mediaCellSize(cellSize: number, q: ProjectedQuad): number {
    if (!q.valid) return cellSize;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of q.corners) {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }
    const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
    const est = area / (cellSize * cellSize);
    return est <= MEDIA_CELL_CAP ? cellSize : Math.ceil(Math.sqrt(area / MEDIA_CELL_CAP));
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

  function strokeQuad(q: ProjectedQuad, color: string, width: number, alpha: number) {
    if (!q.valid) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.5, width);
    ctx.globalAlpha = alpha;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(q.corners[0].x, q.corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(q.corners[i].x, q.corners[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // Builds + draws the 3-axis move gizmo at the selected pane's origin, and
  // records the screen-space segments so controls can hit-test/drag the axes.
  function drawGizmo(s: Scene, vp: { width: number; height: number }) {
    gizmoSegs = [];
    const sel = s.panes.find((p) => p.id === s.selectedId);
    if (!sel) return;
    const O = worldToScreen(sel.position, s.camera, vp);
    if (O.depth <= 0.01) return;

    for (const a of GIZMO_AXES) {
      const end = {
        x: sel.position.x + a.dir[0] * GIZMO_LEN,
        y: sel.position.y + a.dir[1] * GIZMO_LEN,
        z: sel.position.z + a.dir[2] * GIZMO_LEN,
      };
      const E = worldToScreen(end, s.camera, vp);
      if (E.depth <= 0.01) continue;
      const dx = E.screen.x - O.screen.x, dy = E.screen.y - O.screen.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue; // axis points straight at camera — not grabbable
      const ux = dx / len, uy = dy / len;
      gizmoSegs.push({
        axis: a.axis, ox: O.screen.x, oy: O.screen.y, ex: E.screen.x, ey: E.screen.y,
        ux, uy, worldPerPx: GIZMO_LEN / len, color: a.color,
      });

      ctx.save();
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(O.screen.x, O.screen.y);
      ctx.lineTo(E.screen.x, E.screen.y);
      ctx.stroke();
      // Arrowhead.
      const ah = 8, aw = 5;
      ctx.beginPath();
      ctx.moveTo(E.screen.x, E.screen.y);
      ctx.lineTo(E.screen.x - ux * ah - uy * aw, E.screen.y - uy * ah + ux * aw);
      ctx.lineTo(E.screen.x - ux * ah + uy * aw, E.screen.y - uy * ah - ux * aw);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Origin handle on top.
    ctx.save();
    ctx.fillStyle = "#f5f5f5";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(O.screen.x, O.screen.y, 3.5, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Distance from point to segment, for axis grabbing.
  function distToSeg(px: number, py: number, g: GizmoSeg): number {
    const dx = g.ex - g.ox, dy = g.ey - g.oy;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - g.ox) * dx + (py - g.oy) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const cx = g.ox + t * dx, cy = g.oy + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  resize();
  requestAnimationFrame(frame);

  return {
    setScene(s) { scene = s; dirty = true; },
    setBitmaps(m) { bitmaps = m; dirty = true; },
    setMediaSampler(fn) { mediaSampler = fn; dirty = true; },
    resize,
    markDirty() { dirty = true; },
    clearMediaSample(id) { mediaCache.delete(id); dirty = true; },
    beginCapture(w, h) {
      // Same framing (viewport stays cssW/cssH), rasterized at w×h via transform.
      showOverlay = false;
      canvas.width = w; canvas.height = h;
      ctx.setTransform(w / cssW, 0, 0, h / cssH, 0, 0);
      paint(lastTs); // synchronous so the canvas holds the frame for PNG toBlob
    },
    endCapture() { showOverlay = true; resize(); }, // resize() restores backing + transform
    pickAt(x, y) {
      if (!scene) return null;
      const idx = pickPane(lastOrder, lastQuads, lastBitmaps, x, y);
      return idx >= 0 ? scene.panes[idx].id : null;
    },
    pickGizmo(x, y) {
      let best: Axis | null = null, bestD = GIZMO_HIT;
      for (const g of gizmoSegs) {
        const d = distToSeg(x, y, g);
        if (d < bestD) { bestD = d; best = g.axis; }
      }
      return best;
    },
    gizmoAxisVec(axis) {
      const g = gizmoSegs.find((s) => s.axis === axis);
      return g ? { ux: g.ux, uy: g.uy, worldPerPx: g.worldPerPx } : null;
    },
  };
}
