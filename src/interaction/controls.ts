import type { Store } from "../state/store";

const ORBIT_SENSITIVITY = 0.01; // radians per px
const PAN_SENSITIVITY = 1;       // px per px
const ZOOM_STEP = 1.0015;        // per wheel delta unit
const CLICK_SLOP = 4;            // px of movement still counted as a click

export function attachControls(
  canvas: HTMLCanvasElement,
  store: Store,
  onSelectAt: (x: number, y: number) => void,
): void {
  let dragging = false;
  let lastX = 0, lastY = 0;
  let downX = 0, downY = 0, moved = 0;

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    downX = e.clientX; downY = e.clientY; moved = 0;
    canvas.classList.add("dragging");
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    store.update((s) => {
      const cam = s.camera;
      if (e.shiftKey) {
        return { ...s, camera: { ...cam, pan: { x: cam.pan.x + dx * PAN_SENSITIVITY, y: cam.pan.y + dy * PAN_SENSITIVITY } } };
      }
      return { ...s, camera: { ...cam, orbit: { yaw: cam.orbit.yaw + dx * ORBIT_SENSITIVITY, pitch: cam.orbit.pitch + dy * ORBIT_SENSITIVITY } } };
    });
  });

  const end = (e: PointerEvent) => {
    if (dragging && moved < CLICK_SLOP) {
      const rect = canvas.getBoundingClientRect();
      onSelectAt(downX - rect.left, downY - rect.top);
    }
    dragging = false;
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
