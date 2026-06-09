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

export function attachControls(
  canvas: HTMLCanvasElement,
  store: Store,
  onSelectAt: (x: number, y: number) => void,
  gizmo: GizmoControl,
): void {
  let dragging = false;
  let lastX = 0, lastY = 0;
  let downX = 0, downY = 0, moved = 0;
  let dragAxis: Axis | null = null; // non-null while dragging a gizmo arrow

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    downX = e.clientX; downY = e.clientY; moved = 0;
    const rect = canvas.getBoundingClientRect();
    dragAxis = gizmo.pick(e.clientX - rect.left, e.clientY - rect.top);
    canvas.classList.add("dragging");
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
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
    if (!dragAxis && dragging && moved < CLICK_SLOP) {
      const rect = canvas.getBoundingClientRect();
      onSelectAt(downX - rect.left, downY - rect.top);
    }
    dragging = false;
    dragAxis = null;
    canvas.classList.remove("dragging");
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    store.update((s) => ({ ...s, camera: { ...s.camera, zoom: Math.max(0.05, Math.min(50, s.camera.zoom * Math.pow(ZOOM_STEP, -e.deltaY))) } }));
  }, { passive: false });
}
