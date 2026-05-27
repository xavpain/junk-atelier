import type { Store } from "../state/store";

const ORBIT_SENSITIVITY = 0.01; // radians per px
const PAN_SENSITIVITY = 1;       // px per px
const ZOOM_STEP = 1.0015;        // per wheel delta unit

export function attachControls(canvas: HTMLCanvasElement, store: Store): void {
  let dragging = false;
  let shift = false;
  let lastX = 0, lastY = 0;

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    shift = e.shiftKey;
    lastX = e.clientX; lastY = e.clientY;
    canvas.classList.add("dragging");
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    const s = store.get();
    if (shift) {
      store.set({ pan: { x: s.pan.x + dx * PAN_SENSITIVITY, y: s.pan.y + dy * PAN_SENSITIVITY } });
    } else {
      store.set({
        orbit: {
          yaw: s.orbit.yaw + dx * ORBIT_SENSITIVITY,
          pitch: s.orbit.pitch + dy * ORBIT_SENSITIVITY,
        },
      });
    }
  });

  const end = (e: PointerEvent) => {
    dragging = false;
    canvas.classList.remove("dragging");
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const s = store.get();
    const factor = Math.pow(ZOOM_STEP, -e.deltaY);
    store.set({ zoom: Math.max(0.05, Math.min(50, s.zoom * factor)) });
  }, { passive: false });
}
