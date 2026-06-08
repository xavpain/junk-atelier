import type { Shape, AnimMode, BgStyle, ColorMode } from "../types";
import type { Store } from "../state/store";
import {
  getSelected, addPane, duplicatePane, deletePane, selectPane, updateSelected,
} from "../state/store";

interface PanelCallbacks {
  onExport: () => void;
  onShare: () => void;
  onReset: () => void;
  onRecord: () => void;
}

export function buildPanel(root: HTMLElement, store: Store, cb: PanelCallbacks): void {
  const scene = store.get();
  const sel = getSelected(scene);
  root.innerHTML = "";

  // ---- PANES list ----
  root.append(sectionLabel("Panes"));
  const list = document.createElement("div");
  list.className = "pane-list";
  scene.panes.forEach((p) => {
    const row = document.createElement("div");
    row.className = "pane-row" + (p.id === scene.selectedId ? " sel" : "");
    row.textContent = (p.text.split("\n")[0] || "(empty)").slice(0, 18);
    row.addEventListener("click", () => store.update((s) => selectPane(s, p.id)));
    list.append(row);
  });
  root.append(list);

  const paneBtns = row3(
    btn("+ Add", () => store.update(addPane)),
    btn("Dup", () => store.update(duplicatePane)),
    btn("Del", () => store.update(deletePane)),
  );
  root.append(paneBtns);

  // ---- SELECTED PANE ----
  root.append(sectionLabel("Selected pane"));
  root.append(labeled("Text", `<textarea id="p-text" rows="2">${escapeHtml(sel.text)}</textarea>`));
  bindInput(root, "#p-text", "input", (v) => up({ text: v }));

  root.append(select("p-shape", "Shape", ["square", "grid", "circle", "triangle", "line"], sel.shape));
  bindInput(root, "#p-shape", "change", (v) => up({ shape: v as Shape }));

  addSlider(root, "p-thick", "Thickness", -4, 4, 1, sel.thickness, (v) => up({ thickness: v }));
  addSlider(root, "p-scale", "Scale", 0.2, 4, 0.01, sel.scale, (v) => up({ scale: v }));
  addSlider(root, "p-cell", "Resolution (cell px)", 2, 24, 1, sel.cellSize, (v) => up({ cellSize: v }));

  addSlider(root, "p-px", "Pos X", -10, 10, 0.05, sel.position.x, (v) => up({ position: { ...cur().position, x: v } }));
  addSlider(root, "p-py", "Pos Y", -10, 10, 0.05, sel.position.y, (v) => up({ position: { ...cur().position, y: v } }));
  addSlider(root, "p-pz", "Pos Z", -10, 10, 0.05, sel.position.z, (v) => up({ position: { ...cur().position, z: v } }));

  addSlider(root, "p-rx", "Rotate X", -Math.PI, Math.PI, 0.01, sel.rotation.x, (v) => up({ rotation: { ...cur().rotation, x: v } }));
  addSlider(root, "p-ry", "Rotate Y", -Math.PI, Math.PI, 0.01, sel.rotation.y, (v) => up({ rotation: { ...cur().rotation, y: v } }));
  addSlider(root, "p-rz", "Rotate Z", -Math.PI, Math.PI, 0.01, sel.rotation.z, (v) => up({ rotation: { ...cur().rotation, z: v } }));

  addSlider(root, "p-skx", "Skew X", -1.5, 1.5, 0.01, sel.skew.x, (v) => up({ skew: { ...cur().skew, x: v } }));
  addSlider(root, "p-sky", "Skew Y", -1.5, 1.5, 0.01, sel.skew.y, (v) => up({ skew: { ...cur().skew, y: v } }));

  root.append(select("p-cmode", "Color mode", ["solid", "gradient"], sel.colorMode));
  bindInput(root, "#p-cmode", "change", (v) => up({ colorMode: v as ColorMode }));
  root.append(labeled("Colors", `
    <div class="row">
      <input type="color" id="p-color" value="${escapeHtml(sel.color)}">
      <input type="color" id="p-color2" value="${escapeHtml(sel.color2)}">
    </div>`));
  bindInput(root, "#p-color", "input", (v) => up({ color: v }));
  bindInput(root, "#p-color2", "input", (v) => up({ color2: v }));
  addSlider(root, "p-alpha", "Opacity", 0, 1, 0.01, sel.alpha, (v) => up({ alpha: v }));

  root.append(labeled("Animate", `<label class="inline"><input type="checkbox" id="p-animate" ${sel.animate ? "checked" : ""}> scroll text</label>`));
  bindChecked(root, "#p-animate", (v) => up({ animate: v }));
  root.append(select("p-animmode", "Scroll mode", ["credits", "marquee"], sel.animMode));
  bindInput(root, "#p-animmode", "change", (v) => up({ animMode: v as AnimMode }));
  root.append(select("p-animdir", "Direction", ["forward", "reverse"], sel.animDir === 1 ? "forward" : "reverse"));
  bindInput(root, "#p-animdir", "change", (v) => up({ animDir: v === "forward" ? 1 : -1 }));
  addSlider(root, "p-speed", "Speed (px/s)", 0, 300, 5, sel.animSpeed, (v) => up({ animSpeed: v }));

  // ---- GLOBAL ----
  root.append(sectionLabel("Global"));
  root.append(select("p-bgstyle", "Background", ["solid", "grid", "dotted"], scene.background.style));
  bindInput(root, "#p-bgstyle", "change", (v) => setBg({ style: v as BgStyle }));
  root.append(labeled("Bg colors", `
    <div class="row">
      <input type="color" id="p-bgcolor" value="${escapeHtml(scene.background.color)}">
      <input type="color" id="p-bgaccent" value="${escapeHtml(scene.background.accent)}">
      <label class="inline"><input type="checkbox" id="p-bgtrans" ${scene.background.transparent ? "checked" : ""}> transp.</label>
    </div>`));
  bindInput(root, "#p-bgcolor", "input", (v) => setBg({ color: v }));
  bindInput(root, "#p-bgaccent", "input", (v) => setBg({ accent: v }));
  bindChecked(root, "#p-bgtrans", (v) => setBg({ transparent: v }));
  addSlider(root, "p-bgspace", "Bg spacing", 4, 64, 1, scene.background.spacing, (v) => setBg({ spacing: v }));
  root.append(labeled("Fade", `
    <div class="row">
      <label class="inline"><input type="checkbox" id="p-bgfade" ${scene.background.fade ? "checked" : ""}> animate</label>
      <input type="color" id="p-bgfadecolor" value="${escapeHtml(scene.background.fadeColor)}">
    </div>`));
  bindChecked(root, "#p-bgfade", (v) => setBg({ fade: v }));
  bindInput(root, "#p-bgfadecolor", "input", (v) => setBg({ fadeColor: v }));

  addSlider(root, "p-fov", "FOV (deg)", 10, 120, 1, (scene.camera.fov * 180) / Math.PI,
    (deg) => store.update((s) => ({ ...s, camera: { ...s.camera, fov: (deg * Math.PI) / 180 } })));

  root.append(row3(
    btn("Reset", cb.onReset),
    btn("Share", cb.onShare),
    btn("PNG", cb.onExport),
  ));
  const recRow = document.createElement("div");
  recRow.className = "row";
  recRow.innerHTML = `<button id="p-record">Record WebM</button>
    <label class="inline" style="flex:1"><span style="white-space:nowrap">len</span>
    <input type="range" id="p-dur" min="1" max="30" step="1" value="6"></label>`;
  root.append(recRow);
  (root.querySelector("#p-record") as HTMLButtonElement).addEventListener("click", cb.onRecord);

  // ---- helpers bound to this store ----
  function up(patch: Parameters<typeof updateSelected>[1]) { store.update((s) => updateSelected(s, patch)); }
  function cur() { return getSelected(store.get()); }
  function setBg(patch: Partial<typeof scene.background>) {
    store.update((s) => ({ ...s, background: { ...s.background, ...patch } }));
  }
}

// ---- generic DOM helpers ----

function sectionLabel(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "section-label";
  el.textContent = text;
  return el;
}

function labeled(text: string, innerHtml: string): HTMLElement {
  const el = document.createElement("label");
  el.innerHTML = `<span>${text}</span>${innerHtml}`;
  return el;
}

function select(id: string, text: string, opts: string[], value: string): HTMLElement {
  return labeled(text, `<select id="${id}">${opts
    .map((o) => `<option value="${o}" ${o === value ? "selected" : ""}>${o}</option>`)
    .join("")}</select>`);
}

function addSlider(
  root: HTMLElement, id: string, text: string,
  min: number, max: number, step: number, value: number,
  onInput: (v: number) => void,
): void {
  const el = labeled(text, `<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">`);
  root.append(el);
  const input = el.querySelector("input") as HTMLInputElement;
  input.addEventListener("input", () => onInput(parseFloat(input.value)));
}

function bindInput(root: HTMLElement, sel: string, evt: string, fn: (v: string) => void): void {
  (root.querySelector(sel) as HTMLElement).addEventListener(evt, (e) => fn((e.target as HTMLInputElement).value));
}

function bindChecked(root: HTMLElement, sel: string, fn: (v: boolean) => void): void {
  (root.querySelector(sel) as HTMLElement).addEventListener("change", (e) => fn((e.target as HTMLInputElement).checked));
}

function btn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function row3(...els: HTMLElement[]): HTMLElement {
  const r = document.createElement("div");
  r.className = "row";
  r.append(...els);
  return r;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
