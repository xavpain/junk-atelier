import "./style.css";
import type { Bitmap, Scene } from "./types";
import { createStore, defaultScene, defaultCamera, selectPane, updateSelected, getSelected } from "./state/store";
import { applyHashToStore, buildShareUrl } from "./share/shareLink";
import { loadGeistPixel, rasterizeText, ensureFont } from "./font/rasterizeText";
import { createRenderer } from "./render/renderer";
import { attachControls } from "./interaction/controls";
import { buildPanels } from "./ui/panel";
import { exportPng } from "./export/exportPng";
import { recordWebm } from "./export/exportWebm";
import { importMediaForPane, removeMedia, sampleMedia } from "./media/media";

async function main() {
  const canvas = document.getElementById("viewer") as HTMLCanvasElement;
  const panelLeft = document.getElementById("panel-left") as HTMLElement;
  const panelRight = document.getElementById("panel-right") as HTMLElement;

  const store = createStore(defaultScene());
  applyHashToStore(store);

  try {
    await loadGeistPixel();
  } catch (err) {
    panelLeft.innerHTML = `<p>Failed to load Geist Pixel font.<br>${(err as Error).message}</p>
      <button onclick="location.reload()">Retry</button>`;
    return;
  }

  const renderer = createRenderer(canvas);
  renderer.setMediaSampler(sampleMedia);

  const errorEl = document.createElement("div");
  errorEl.id = "error";
  errorEl.style.cssText =
    "position:fixed;bottom:16px;left:16px;padding:8px 12px;background:#5a1a1a;" +
    "color:#fff;border-radius:4px;font-size:12px;display:none;z-index:10;";
  document.body.appendChild(errorEl);

  // Font loading: Geist is ready (awaited above); other families load on demand
  // and trigger a re-render once available.
  const fontReady = new Set<string>(["Geist Pixel Square"]);
  const fontKicked = new Set<string>();
  function maybeLoadFont(family: string) {
    if (fontReady.has(family) || fontKicked.has(family)) return;
    fontKicked.add(family);
    ensureFont(family).then(() => {
      fontReady.add(family);
      for (const [id, c] of cache) if (c.font === family) cache.delete(id);
      const s = store.get();
      syncBitmaps(s);
      renderer.setScene(s);
    });
  }

  // Per-pane bitmap cache; re-rasterize a text pane only when its inputs change.
  // Media panes carry no bitmap — the renderer samples them via the media sampler.
  const cache = new Map<string, { text: string; thickness: number; font: string; bitmap: Bitmap }>();
  function syncBitmaps(scene: Scene) {
    const map = new Map<string, Bitmap>();
    let err = "";
    for (const p of scene.panes) {
      if (p.source === "media") continue;
      maybeLoadFont(p.font);
      const hit = cache.get(p.id);
      if (hit && hit.text === p.text && hit.thickness === p.thickness && hit.font === p.font) {
        map.set(p.id, hit.bitmap);
        continue;
      }
      try {
        const bitmap = rasterizeText(p.text, p.thickness, p.font);
        cache.set(p.id, { text: p.text, thickness: p.thickness, font: p.font, bitmap });
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
    if (sig !== panelSig) { panelSig = sig; buildPanels(panelLeft, panelRight, store, callbacks); }
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
      buildPanels(panelLeft, panelRight, store, callbacks);
    },
    onResetCamera: () => store.update((s) => ({ ...s, camera: defaultCamera() })),
    onImportMedia: async (file: File) => {
      const id = getSelected(store.get()).id;
      try {
        const { name } = await importMediaForPane(id, file);
        store.update((s) => updateSelected(s, { source: "media", mediaName: name }));
        renderer.markDirty();
      } catch (e) {
        errorEl.textContent = (e as Error).message;
        errorEl.style.display = "block";
      }
    },
    onRemoveMedia: () => {
      const id = getSelected(store.get()).id;
      removeMedia(id);
      store.update((s) => updateSelected(s, { source: "text", mediaName: "" }));
      renderer.markDirty();
    },
    onRecord: async () => {
      const btn = document.querySelector("#p-record") as HTMLButtonElement;
      const durSec = parseFloat((document.querySelector("#p-dur") as HTMLInputElement).value);
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
  buildPanels(panelLeft, panelRight, store, callbacks);

  attachControls(canvas, store, (x, y) => {
    const id = renderer.pickAt(x, y);
    if (id) store.update((s) => selectPane(s, id));
  });
  window.addEventListener("resize", () => renderer.resize());
}

main();
