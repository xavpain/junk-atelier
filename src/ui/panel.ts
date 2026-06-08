import type { Shape, AnimMode } from "../types";
import type { Store } from "../state/store";

interface PanelCallbacks {
  onExport: () => void;
  onShare: () => void;
  onReset: () => void;
  onRecord: () => void;
}

export function buildPanel(root: HTMLElement, store: Store, cb: PanelCallbacks): void {
  const s = store.get();
  root.innerHTML = "";

  const textLabel = labeled("Text", `<textarea id="p-text" rows="2">${escapeHtml(s.text)}</textarea>`);
  const shapeLabel = labeled("Shape", `
    <select id="p-shape">
      ${(["square", "grid", "circle", "triangle", "line"] as Shape[])
        .map((sh) => `<option value="${sh}" ${sh === s.shape ? "selected" : ""}>${sh}</option>`)
        .join("")}
    </select>`);

  const rotX = slider("p-rotx", "Rotate X", -Math.PI, Math.PI, 0.01, s.objRotation.x);
  const rotY = slider("p-roty", "Rotate Y", -Math.PI, Math.PI, 0.01, s.objRotation.y);
  const rotZ = slider("p-rotz", "Rotate Z", -Math.PI, Math.PI, 0.01, s.objRotation.z);
  const scale = slider("p-scale", "Scale", 0.2, 4, 0.01, s.scale);
  const fov = slider("p-fov", "FOV (deg)", 10, 120, 1, (s.fov * 180) / Math.PI);
  const cell = slider("p-cell", "Resolution (cell px)", 2, 24, 1, s.cellSize);
  const thick = slider("p-thick", "Thickness", -4, 4, 1, s.thickness);

  const bg = labeled("Background", `
    <div class="row">
      <input type="color" id="p-bg" value="${escapeHtml(s.background)}">
      <label class="inline"><input type="checkbox" id="p-transparent" ${s.transparent ? "checked" : ""}> transparent</label>
    </div>`);

  const animTog = labeled("Animate", `
    <label class="inline"><input type="checkbox" id="p-animate" ${s.animate ? "checked" : ""}> scroll text</label>`);
  const animMode = labeled("Scroll", `
    <select id="p-animmode">
      ${(["credits", "marquee"] as AnimMode[])
        .map((m) => `<option value="${m}" ${m === s.animMode ? "selected" : ""}>${m}</option>`)
        .join("")}
    </select>`);
  const speed = slider("p-speed", "Speed (px/s)", 0, 300, 5, s.animSpeed);
  const dur = slider("p-dur", "Clip length (s)", 1, 30, 1, 6);

  const buttons = document.createElement("div");
  buttons.className = "row";
  buttons.innerHTML = `<button id="p-reset">Reset</button>
    <button id="p-share">Share</button><button id="p-export">PNG</button>`;
  const recRow = document.createElement("div");
  recRow.className = "row";
  recRow.innerHTML = `<button id="p-record">Record WebM</button>`;

  root.append(textLabel, shapeLabel, rotX.el, rotY.el, rotZ.el, scale.el, fov.el, cell.el, thick.el,
    bg, animTog, animMode, speed.el, dur.el, buttons, recRow);

  (root.querySelector("#p-text") as HTMLInputElement)
    .addEventListener("input", (e) => store.set({ text: (e.target as HTMLInputElement).value }));
  (root.querySelector("#p-shape") as HTMLSelectElement)
    .addEventListener("change", (e) => store.set({ shape: (e.target as HTMLSelectElement).value as Shape }));

  rotX.bind((v) => store.set({ objRotation: { ...store.get().objRotation, x: v } }));
  rotY.bind((v) => store.set({ objRotation: { ...store.get().objRotation, y: v } }));
  rotZ.bind((v) => store.set({ objRotation: { ...store.get().objRotation, z: v } }));
  scale.bind((v) => store.set({ scale: v }));
  fov.bind((deg) => store.set({ fov: (deg * Math.PI) / 180 }));
  cell.bind((v) => store.set({ cellSize: v }));
  thick.bind((v) => store.set({ thickness: v }));

  (root.querySelector("#p-bg") as HTMLInputElement)
    .addEventListener("input", (e) => store.set({ background: (e.target as HTMLInputElement).value }));
  (root.querySelector("#p-transparent") as HTMLInputElement)
    .addEventListener("change", (e) => store.set({ transparent: (e.target as HTMLInputElement).checked }));
  (root.querySelector("#p-animate") as HTMLInputElement)
    .addEventListener("change", (e) => store.set({ animate: (e.target as HTMLInputElement).checked }));
  (root.querySelector("#p-animmode") as HTMLSelectElement)
    .addEventListener("change", (e) => store.set({ animMode: (e.target as HTMLSelectElement).value as AnimMode }));
  speed.bind((v) => store.set({ animSpeed: v }));

  (root.querySelector("#p-reset") as HTMLButtonElement).addEventListener("click", cb.onReset);
  (root.querySelector("#p-share") as HTMLButtonElement).addEventListener("click", cb.onShare);
  (root.querySelector("#p-export") as HTMLButtonElement).addEventListener("click", cb.onExport);
  (root.querySelector("#p-record") as HTMLButtonElement).addEventListener("click", cb.onRecord);
}

function labeled(text: string, innerHtml: string): HTMLElement {
  const el = document.createElement("label");
  el.innerHTML = `<span>${text}</span>${innerHtml}`;
  return el;
}

function slider(id: string, text: string, min: number, max: number, step: number, value: number) {
  const el = document.createElement("label");
  el.innerHTML = `<span>${text}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">`;
  const input = el.querySelector("input") as HTMLInputElement;
  return {
    el,
    bind(fn: (v: number) => void) {
      input.addEventListener("input", () => fn(parseFloat(input.value)));
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
