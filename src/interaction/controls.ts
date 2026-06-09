import type { Store } from "../state/store";
import { getSelected, updateSelected } from "../state/store";
import type { Axis } from "../types";

const ORBIT_SENSITIVITY = 0.01; // radians per px
const PAN_SENSITIVITY = 1;       // px per px
const ZOOM_STEP = 1.0015;        // per wheel delta unit
const CLICK_SLOP = 4;            // px of movement still counted as a click

// Lets controls query/drag the selected pane's move gizmo (lives in renderer).
export interface GizmoControl {
  pick(x: number, y: number): Axis | null;
  axisVec(axis: Axis): { ux: number; uy: number; worldPerPx: number } | null;
}

const clampZoom = (z: number) => Math.max(0.05, Math.min(50, z));

export function attachControls(
  canvas: HTMLCanvasElement,
  store: Store,
  onSelectAt: (x: number, y: number) => void,
  gizmo: GizmoControl,
): void {
  // Track every active pointer so touch can distinguish a single-finger orbit
  // from a two-finger pinch/pan. Mouse always reports as a single pointer.
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let lastX = 0, lastY = 0;
  let downX = 0, downY = 0, moved = 0;
  let dragAxis: Axis | null = null; // non-null while dragging a gizmo arrow

  // Two-finger gesture state (pinch zoom + drag pan).
  let multi = false;       // a multi-touch gesture owns the interaction
  let pinchDist = 0;       // last finger separation, px
  let midX = 0, midY = 0;  // last gesture midpoint, px

  canvas.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);

    if (pointers.size >= 2) {
      // Second finger down: hand off to the pinch/pan gesture and abandon any
      // single-finger orbit/gizmo drag so it isn't counted as a tap-to-select.
      dragging = false; dragAxis = null; multi = true;
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      midX = (a.x + b.x) / 2; midY = (a.y + b.y) / 2;
      return;
    }

    dragging = true; multi = false;
    lastX = e.clientX; lastY = e.clientY;
    downX = e.clientX; downY = e.clientY; moved = 0;
    const rect = canvas.getBoundingClientRect();
    dragAxis = gizmo.pick(e.clientX - rect.left, e.clientY - rect.top);
    canvas.classList.add("dragging");
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;

    // Two fingers: separation drives zoom, midpoint travel drives pan.
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dPanX = mx - midX, dPanY = my - midY;
      const ratio = pinchDist > 0 ? dist / pinchDist : 1;
      pinchDist = dist; midX = mx; midY = my;
      store.update((s) => {
        const cam = s.camera;
        return { ...s, camera: { ...cam, zoom: clampZoom(cam.zoom * ratio),
          pan: { x: cam.pan.x + dPanX * PAN_SENSITIVITY, y: cam.pan.y + dPanY * PAN_SENSITIVITY } } };
      });
      return;
    }

    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);

    // Gizmo drag: project the screen motion onto the axis and translate the pane.
    if (dragAxis) {
      const v = gizmo.axisVec(dragAxis);
      if (v) {
        const world = (dx * v.ux + dy * v.uy) * v.worldPerPx;
        const axis = dragAxis;
        store.update((s) => {
          const sel = getSelected(s);
          return updateSelected(s, { position: { ...sel.position, [axis]: sel.position[axis] + world } });
        });
      }
      return;
    }

    store.update((s) => {
      const cam = s.camera;
      if (e.shiftKey) {
        return { ...s, camera: { ...cam, pan: { x: cam.pan.x + dx * PAN_SENSITIVITY, y: cam.pan.y + dy * PAN_SENSITIVITY } } };
      }
      return { ...s, camera: { ...cam, orbit: { yaw: cam.orbit.yaw + dx * ORBIT_SENSITIVITY, pitch: cam.orbit.pitch + dy * ORBIT_SENSITIVITY } } };
    });
  });

  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    // Only finalize once every finger is up — a multi-touch gesture never
    // resolves to a tap-select.
    if (pointers.size > 0) return;
    if (!multi && !dragAxis && dragging && moved < CLICK_SLOP) {
      const rect = canvas.getBoundingClientRect();
      onSelectAt(downX - rect.left, downY - rect.top);
    }
    dragging = false;
    dragAxis = null;
    multi = false;
    canvas.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    store.update((s) => ({ ...s, camera: { ...s.camera, zoom: clampZoom(s.camera.zoom * Math.pow(ZOOM_STEP, -e.deltaY)) } }));
  }, { passive: false });
}
