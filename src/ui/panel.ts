import type { Shape, AnimMode, BgStyle, ColorMode, Axis, PaneSource, AspectKey, Pane, Background } from "../types";
import type { Store } from "../state/store";
import {
  getSelected, addPane, duplicatePane, deletePane, selectPane, updateSelected,
} from "../state/store";
import { FONT_CATALOG } from "../font/rasterizeText";

export interface PanelCallbacks {
  onExport: () => void;
  onShare: () => void;
  onReset: () => void;
  onRecord: () => void;
  onResetCamera: () => void;
  onImportMedia: (file: File) => void;
  onRemoveMedia: () => void;
  onLoadDemo: () => void;
}

// Collapse state persists across rebuilds (rebuilt on selection / pane changes).
// On phones both panels start collapsed (just titlebars) so the canvas is the
// first thing you see — tap a titlebar to open the controls.
const startCollapsed = typeof matchMedia === "function" && matchMedia("(max-width: 720px)").matches;
let leftCollapsed = startCollapsed;
let rightCollapsed = startCollapsed;

export function buildPanels(left: HTMLElement, right: HTMLElement, store: Store, cb: PanelCallbacks): void {
  buildLeft(left, store, cb);
  buildRight(right, store, cb);
}

// ---------------- LEFT: scene + global ----------------

function buildLeft(root: HTMLElement, store: Store, cb: PanelCallbacks): void {
  const scene = store.get();
  root.innerHTML = "";
  root.classList.toggle("collapsed", leftCollapsed);

  const body = panelShell(root, "Scene", () => { leftCollapsed = !leftCollapsed; root.classList.toggle("collapsed", leftCollapsed); });

  // Layout: a scroll area (Panes + Canvas + Background) above a pinned footer
  // (Camera + Export) so export/camera never scroll out of reach as panes grow.
  body.classList.add("has-foot");
  const scroll = el("div", "panel-scroll");
  const foot = el("div", "panel-foot");
  body.append(scroll, foot);

  // Panes list
  const panes = group(scroll, "Panes", true);
  const list = el("div", "pane-list");
  scene.panes.forEach((p) => {
    const row = el("div", "pane-row" + (p.id === scene.selectedId ? " sel" : ""));
    const isMedia = p.source === "media";
    const ico = el("span", "pane-ico");
    ico.textContent = isMedia ? "■" : "T"; // font-safe markers (emoji glyphs tofu on some systems)
    const label = el("span", "pane-label");
    label.textContent = (isMedia ? (p.mediaName || "media") : (p.text.split("\n")[0] || "(empty)")).slice(0, 18);
    row.append(ico, label);
    row.addEventListener("click", () => store.update((s) => selectPane(s, p.id)));
    list.append(row);
  });
  panes.append(list);
  panes.append(rowOf(
    btn("+ Add", () => store.update(addPane), "accent"),
    btn("Dup", () => store.update(duplicatePane)),
    btn("Del", () => store.update(deletePane), "danger"),
  ));

  // Canvas / format
  const fmt = group(scroll, "Canvas", true);
  selectRow(fmt, "Format", ["free", "9:16", "1:1", "4:5", "16:9", "4:3"], scene.aspect,
    (v) => store.update((s) => ({ ...s, aspect: v as AspectKey })), {
      free: "free · fit window",
      "9:16": "9:16 · reel / tiktok / shorts",
      "1:1": "1:1 · square post",
      "4:5": "4:5 · insta portrait",
      "16:9": "16:9 · youtube / desktop",
      "4:3": "4:3 · classic",
    });

  // Background
  const setBg = (patch: Partial<Background>) => store.update((s) => ({ ...s, background: { ...s.background, ...patch } }));
  const bg = group(scroll, "Background", true);
  selectRow(bg, "Style", ["solid", "grid", "dotted"], scene.background.style, (v) => setBg({ style: v as BgStyle }));
  colorRow(bg, "Base", scene.background.color, (v) => setBg({ color: v }));
  checkRow(bg, "Transparent", scene.background.transparent, (v) => setBg({ transparent: v }));
  colorRow(bg, "Accent", scene.background.accent, (v) => setBg({ accent: v }));
  sliderRow(bg, "Spacing", 4, 64, 1, scene.background.spacing, (v) => setBg({ spacing: v }));
  sliderRow(bg, "Dot radius", 0.5, 6, 0.5, scene.background.dotRadius, (v) => setBg({ dotRadius: v }));
  checkRow(bg, "Animate fade", scene.background.fade, (v) => setBg({ fade: v }));
  colorRow(bg, "Fade to", scene.background.fadeColor, (v) => setBg({ fadeColor: v }));
  sliderRow(bg, "Fade speed", 0.02, 2, 0.02, scene.background.fadeSpeed, (v) => setBg({ fadeSpeed: v }));

  // Camera (pinned footer)
  const cam = group(foot, "Camera", false);
  sliderRow(cam, "FOV", 10, 120, 1, (scene.camera.fov * 180) / Math.PI,
    (deg) => store.update((s) => ({ ...s, camera: { ...s.camera, fov: (deg * Math.PI) / 180 } })), (v) => `${v|0}°`);
  cam.append(rowOf(btn("Recenter camera", cb.onResetCamera)));

  // Actions (pinned footer)
  const actions = group(foot, "Export", true);
  actions.append(rowOf(btn("Reset", cb.onReset), btn("Share", cb.onShare), btn("PNG", cb.onExport)));
  const recBtn = btn("Record WebM…", cb.onRecord, "accent");
  recBtn.id = "p-record"; // referenced for the recording busy state
  actions.append(rowOf(recBtn));
  actions.append(rowOf(btn("Load demo", cb.onLoadDemo)));
}

// ---------------- RIGHT: selected pane ----------------

function buildRight(root: HTMLElement, store: Store, cb: PanelCallbacks): void {
  const scene = store.get();
  root.innerHTML = "";
  root.classList.toggle("collapsed", rightCollapsed);

  // No active selection (clicked empty viewport) -> placeholder, no controls.
  const selected = scene.panes.find((p) => p.id === scene.selectedId);
  if (!selected) {
    const body = panelShell(root, "Pane", () => { rightCollapsed = !rightCollapsed; root.classList.toggle("collapsed", rightCollapsed); });
    const hint = el("p", "panel-hint");
    hint.textContent = "No pane selected. Click a pane in the viewport to edit it.";
    body.append(hint);
    return;
  }
  const sel = selected;

  const title = (sel.source === "media" ? (sel.mediaName || "media") : (sel.text.split("\n")[0] || "pane")).slice(0, 14);
  const body = panelShell(root, `Pane · ${title}`, () => { rightCollapsed = !rightCollapsed; root.classList.toggle("collapsed", rightCollapsed); });

  const up = (patch: Partial<Pane>) => store.update((s) => updateSelected(s, patch));
  const cur = () => getSelected(store.get());

  // Source
  const g1 = group(body, "Source", true);
  selectRow(g1, "Type", ["text", "media"], sel.source, (v) => up({ source: v as PaneSource }));

  if (sel.source === "text") {
    const ta = el("label") as HTMLElement;
    ta.innerHTML = `<span>Text</span><textarea id="p-text" rows="2">${esc(sel.text)}</textarea>`;
    g1.append(ta);
    (ta.querySelector("#p-text") as HTMLTextAreaElement).addEventListener("input", (e) => up({ text: (e.target as HTMLTextAreaElement).value }));
    selectRow(g1, "Font", FONT_CATALOG, sel.font, (v) => up({ font: v }));
    selectRow(g1, "Shape", ["square", "grid", "circle", "triangle", "line"], sel.shape, (v) => up({ shape: v as Shape }));
    sliderRow(g1, "Thickness", -4, 4, 1, sel.thickness, (v) => up({ thickness: v }));
  } else {
    const file = document.createElement("input");
    file.type = "file"; file.accept = "image/*,video/*"; file.style.display = "none";
    file.addEventListener("change", () => { if (file.files?.[0]) cb.onImportMedia(file.files[0]); });
    const imp = btn(sel.mediaName ? `Replace · ${sel.mediaName.slice(0, 12)}` : "Import image / video / gif", () => file.click());
    g1.append(rowOf(imp), file);
    if (sel.mediaName) g1.append(rowOf(btn("Remove media", cb.onRemoveMedia, "danger")));
  }
  sliderRow(g1, "Resolution", 1, 24, 1, sel.cellSize, (v) => up({ cellSize: v }));
  sliderRow(g1, "Scale", 0.2, 8, 0.01, sel.scale, (v) => up({ scale: v }));

  // Transform
  const g2 = group(body, "Transform", true);
  sliderRow(g2, "Pos X", -40, 40, 0.1, sel.position.x, (v) => up({ position: { ...cur().position, x: v } }));
  sliderRow(g2, "Pos Y", -40, 40, 0.1, sel.position.y, (v) => up({ position: { ...cur().position, y: v } }));
  sliderRow(g2, "Pos Z", -40, 40, 0.1, sel.position.z, (v) => up({ position: { ...cur().position, z: v } }));
  sliderRow(g2, "Rot X", -Math.PI, Math.PI, 0.01, sel.rotation.x, (v) => up({ rotation: { ...cur().rotation, x: v } }));
  sliderRow(g2, "Rot Y", -Math.PI, Math.PI, 0.01, sel.rotation.y, (v) => up({ rotation: { ...cur().rotation, y: v } }));
  sliderRow(g2, "Rot Z", -Math.PI, Math.PI, 0.01, sel.rotation.z, (v) => up({ rotation: { ...cur().rotation, z: v } }));
  sliderRow(g2, "Skew X", -1.5, 1.5, 0.01, sel.skew.x, (v) => up({ skew: { ...cur().skew, x: v } }));
  sliderRow(g2, "Skew Y", -1.5, 1.5, 0.01, sel.skew.y, (v) => up({ skew: { ...cur().skew, y: v } }));

  // Color (media keeps its sampled colours; only opacity applies)
  const g3 = group(body, "Color", true);
  if (sel.source === "text") {
    selectRow(g3, "Mode", ["solid", "gradient"], sel.colorMode, (v) => up({ colorMode: v as ColorMode }));
    const cwrap = el("label");
    cwrap.innerHTML = `<span>Colors</span><div class="row"><input type="color" id="p-color" value="${esc(sel.color)}"><input type="color" id="p-color2" value="${esc(sel.color2)}"></div>`;
    g3.append(cwrap);
    (cwrap.querySelector("#p-color") as HTMLInputElement).addEventListener("input", (e) => up({ color: (e.target as HTMLInputElement).value }));
    (cwrap.querySelector("#p-color2") as HTMLInputElement).addEventListener("input", (e) => up({ color2: (e.target as HTMLInputElement).value }));
  }
  sliderRow(g3, "Opacity", 0, 1, 0.01, sel.alpha, (v) => up({ alpha: v }));

  // Outline (decorative border around the pane's plane)
  const go = group(body, "Outline", false);
  checkRow(go, "Show outline", sel.outline, (v) => up({ outline: v }));
  colorRow(go, "Outline color", sel.outlineColor, (v) => up({ outlineColor: v }));
  sliderRow(go, "Outline width", 0.5, 8, 0.5, sel.outlineWidth, (v) => up({ outlineWidth: v }));

  // Card backing
  const g4 = group(body, "Card backing", false);
  checkRow(g4, "Show card", sel.card, (v) => up({ card: v }));
  colorRow(g4, "Card color", sel.cardColor, (v) => up({ cardColor: v }));
  sliderRow(g4, "Card opacity", 0, 1, 0.01, sel.cardAlpha, (v) => up({ cardAlpha: v }));

  // Text scroll (text source only)
  if (sel.source === "text") {
    const g5 = group(body, "Text scroll", false);
    checkRow(g5, "Enable", sel.animate, (v) => up({ animate: v }));
    selectRow(g5, "Mode", ["credits", "marquee"], sel.animMode, (v) => up({ animMode: v as AnimMode }));
    selectRow(g5, "Direction", ["forward", "reverse"], sel.animDir === 1 ? "forward" : "reverse", (v) => up({ animDir: v === "forward" ? 1 : -1 }));
    sliderRow(g5, "Speed", 0, 300, 5, sel.animSpeed, (v) => up({ animSpeed: v }));
  }

  // Motion
  const g6 = group(body, "Motion", false);
  checkRow(g6, "Float (wobble)", sel.floatEnabled, (v) => up({ floatEnabled: v }));
  selectRow(g6, "Float axis", ["x", "y", "z"], sel.floatAxis, (v) => up({ floatAxis: v as Axis }));
  sliderRow(g6, "Float amount", 0, 10, 0.1, sel.floatAmp, (v) => up({ floatAmp: v }));
  sliderRow(g6, "Float speed", 0.05, 3, 0.05, sel.floatSpeed, (v) => up({ floatSpeed: v }));
  checkRow(g6, "Sway (rot)", sel.swayEnabled, (v) => up({ swayEnabled: v }));
  selectRow(g6, "Sway axis", ["x", "y", "z"], sel.swayAxis, (v) => up({ swayAxis: v as Axis }));
  sliderRow(g6, "Sway amount", 0, 1.2, 0.01, sel.swayAmp, (v) => up({ swayAmp: v }));
  sliderRow(g6, "Sway speed", 0.05, 3, 0.05, sel.swaySpeed, (v) => up({ swaySpeed: v }));
}

// ---------------- shell / groups ----------------

function panelShell(root: HTMLElement, titleText: string, onToggle: () => void): HTMLElement {
  const head = el("div", "panel-head");
  const t = el("span", "panel-title");
  t.textContent = titleText;
  const c = btn("", onToggle, "collapse");
  head.append(t, c);
  const body = el("div", "panel-body");
  root.append(head, body);
  return body;
}

function group(parent: HTMLElement, title: string, open: boolean): HTMLElement {
  const d = document.createElement("details");
  d.className = "group";
  if (open) d.open = true;
  const s = document.createElement("summary");
  s.textContent = title;
  d.append(s);
  const inner = el("div", "group-body");
  d.append(inner);
  parent.append(d);
  return inner;
}

// ---------------- control rows ----------------

function sliderRow(
  parent: HTMLElement, label: string, min: number, max: number, step: number, value: number,
  onInput: (v: number) => void, fmt: (v: number) => string = (v) => trim(v),
): void {
  const wrap = el("label", "ctrl");
  const head = el("div", "ctrl-head");
  const name = el("span"); name.textContent = label;
  const val = el("span", "val"); val.textContent = fmt(value);
  head.append(name, val);
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value);
  input.addEventListener("input", () => { const v = parseFloat(input.value); val.textContent = fmt(v); onInput(v); });
  wrap.append(head, input);
  parent.append(wrap);
}

function selectRow(parent: HTMLElement, label: string, opts: string[], value: string, onChange: (v: string) => void, labels?: Record<string, string>): void {
  const wrap = el("label", "ctrl");
  wrap.innerHTML = `<span>${label}</span><select>${opts.map((o) => `<option value="${o}" ${o === value ? "selected" : ""}>${esc(labels?.[o] ?? o)}</option>`).join("")}</select>`;
  (wrap.querySelector("select") as HTMLSelectElement).addEventListener("change", (e) => onChange((e.target as HTMLSelectElement).value));
  parent.append(wrap);
}

function colorRow(parent: HTMLElement, label: string, value: string, onInput: (v: string) => void): void {
  const wrap = el("label", "ctrl inline");
  wrap.innerHTML = `<span>${label}</span><input type="color" value="${esc(value)}">`;
  (wrap.querySelector("input") as HTMLInputElement).addEventListener("input", (e) => onInput((e.target as HTMLInputElement).value));
  parent.append(wrap);
}

function checkRow(parent: HTMLElement, label: string, value: boolean, onChange: (v: boolean) => void): void {
  const wrap = el("label", "ctrl inline");
  wrap.innerHTML = `<span>${label}</span><input type="checkbox" ${value ? "checked" : ""}>`;
  (wrap.querySelector("input") as HTMLInputElement).addEventListener("change", (e) => onChange((e.target as HTMLInputElement).checked));
  parent.append(wrap);
}

// ---------------- tiny dom utils ----------------

function el(tag: string, cls = ""): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function btn(label: string, onClick: () => void, cls = ""): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener("click", onClick);
  return b;
}

function rowOf(...els: HTMLElement[]): HTMLElement {
  const r = el("div", "row");
  r.append(...els);
  return r;
}

function trim(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
