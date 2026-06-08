import "./style.css";
import type { Bitmap, Scene } from "./types";
import { createStore, defaultScene, selectPane } from "./state/store";
import { applyHashToStore, buildShareUrl } from "./share/shareLink";
import { loadGeistPixel, rasterizeText } from "./font/rasterizeText";
import { createRenderer } from "./render/renderer";
import { attachControls } from "./interaction/controls";
import { buildPanel } from "./ui/panel";
import { exportPng } from "./export/exportPng";
import { recordWebm } from "./export/exportWebm";

async function main() {
  const canvas = document.getElementById("viewer") as HTMLCanvasElement;
  const panelRoot = document.getElementById("panel") as HTMLElement;

  const store = createStore(defaultScene());
  applyHashToStore(store);

  try {
    await loadGeistPixel();
  } catch (err) {
    panelRoot.innerHTML = `<p>Failed to load Geist Pixel font.<br>${(err as Error).message}</p>
      <button onclick="location.reload()">Retry</button>`;
    return;
  }

  const renderer = createRenderer(canvas);

  const errorEl = document.createElement("div");
  errorEl.id = "error";
  errorEl.style.cssText =
    "position:fixed;bottom:16px;left:16px;padding:8px 12px;background:#5a1a1a;" +
    "color:#fff;border-radius:4px;font-size:12px;display:none;z-index:10;";
  document.body.appendChild(errorEl);

  // Per-pane bitmap cache; re-rasterize a pane only when its text/thickness change.
  const cache = new Map<string, { text: string; thickness: number; bitmap: Bitmap }>();
  function syncBitmaps(scene: Scene) {
    const map = new Map<string, Bitmap>();
    let err = "";
    for (const p of scene.panes) {
      const hit = cache.get(p.id);
      if (hit && hit.text === p.text && hit.thickness === p.thickness) {
        map.set(p.id, hit.bitmap);
        continue;
      }
      try {
        const bitmap = rasterizeText(p.text, p.thickness);
        cache.set(p.id, { text: p.text, thickness: p.thickness, bitmap });
        map.set(p.id, bitmap);
      } catch (e) {
        err = (e as Error).message;
        map.set(p.id, { cols: 0, rows: 0, data: new Uint8Array(0) });
      }
    }
    for (const id of [...cache.keys()]) {
      if (!scene.panes.some((p) => p.id === id)) cache.delete(id);
    }
    errorEl.textContent = err;
    errorEl.style.display = err ? "block" : "none";
    renderer.setBitmaps(map);
  }

  let panelSig = "";
  const paneSig = (s: Scene) => `${s.selectedId}|${s.panes.map((p) => p.id).join(",")}`;

  store.subscribe((scene) => {
    syncBitmaps(scene);
    renderer.setScene(scene);
    const sig = paneSig(scene);
    if (sig !== panelSig) { panelSig = sig; buildPanel(panelRoot, store, callbacks); }
  });

  const callbacks = {
    onExport: () => exportPng(canvas),
    onShare: async () => {
      const url = buildShareUrl(window.location.href, store.get());
      window.history.replaceState(null, "", url);
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    },
    onReset: () => {
      store.set(defaultScene());
      panelSig = ""; // force rebuild
      buildPanel(panelRoot, store, callbacks);
    },
    onRecord: async () => {
      const btn = panelRoot.querySelector("#p-record") as HTMLButtonElement;
      const durSec = parseFloat((panelRoot.querySelector("#p-dur") as HTMLInputElement).value);
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Recording…";
      try {
        await recordWebm(canvas, durSec * 1000);
      } catch (err) {
        errorEl.textContent = (err as Error).message;
        errorEl.style.display = "block";
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    },
  };

  // Initial paint + panel.
  syncBitmaps(store.get());
  renderer.setScene(store.get());
  panelSig = paneSig(store.get());
  buildPanel(panelRoot, store, callbacks);

  attachControls(canvas, store, (x, y) => {
    const id = renderer.pickAt(x, y);
    if (id) store.update((s) => selectPane(s, id));
  });
  window.addEventListener("resize", () => renderer.resize());
}

main();
