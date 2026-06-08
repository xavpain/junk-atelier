import "./style.css";
import { createStore, defaultState } from "./state/store";
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

  const store = createStore(defaultState());
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

  // Re-rasterize only when text or thickness changes; null sentinel forces the first pass.
  let lastText: string | null = null;
  let lastThickness: number | null = null;
  function sync() {
    const s = store.get();
    if (s.text !== lastText || s.thickness !== lastThickness) {
      lastText = s.text;
      lastThickness = s.thickness;
      try {
        renderer.setBitmap(rasterizeText(s.text, s.thickness));
        errorEl.style.display = "none";
      } catch (err) {
        errorEl.textContent = (err as Error).message;
        errorEl.style.display = "block";
      }
    }
    renderer.setState(s);
  }
  store.subscribe(sync);

  const callbacks = {
    onExport: () => exportPng(canvas),
    onShare: async () => {
      const url = buildShareUrl(window.location.href, store.get());
      window.history.replaceState(null, "", url);
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    },
    onReset: () => {
      store.set(defaultState());
      buildPanel(panelRoot, store, callbacks);
    },
    onRecord: async () => {
      const btn = panelRoot.querySelector("#p-record") as HTMLButtonElement;
      const durSec = parseFloat((panelRoot.querySelector("#p-dur") as HTMLInputElement).value);
      if (!store.get().animate) store.set({ animate: true }); // ensure motion to capture
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

  sync();
  attachControls(canvas, store);
  window.addEventListener("resize", () => renderer.resize());
  buildPanel(panelRoot, store, callbacks);
}

main();
