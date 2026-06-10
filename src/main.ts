import "./style.css";
import type { Bitmap, Scene, AspectKey } from "./types";
import { createStore, defaultScene, demoScene, defaultCamera, selectPane, updateSelected, getSelected, serializeScene, deserializeScene } from "./state/store";
import { applyHashToStore, buildShareUrl } from "./share/shareLink";
import { loadGeistPixel, rasterizeText, ensureFont } from "./font/rasterizeText";
import { createRenderer } from "./render/renderer";
import { attachControls } from "./interaction/controls";
import { buildPanels } from "./ui/panel";
import { exportPng } from "./export/exportPng";
import { recordWebm } from "./export/exportWebm";
import { importMediaForPane, loadMediaBlob, removeMedia, sampleMedia, hasMedia } from "./media/media";
import { hashBlob, putBlob, getBlob } from "./media/mediaStore";
import { galleryEnabled } from "./gallery/api";
import { openGallery } from "./ui/gallery";
import { toast, dialog, formModal } from "./ui/notify";

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

  // Canvas aspect / format. `free` fills the window; fixed ratios size the canvas
  // element itself so PNG/WebM exports are exactly that ratio (no letterbox baked in).
  const ASPECTS: Record<AspectKey, number | null> = {
    free: null, "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:5": 4 / 5, "4:3": 4 / 3,
  };
  // Export resolution per format (px). `free` keeps the on-screen size.
  const EXPORT_RES: Record<AspectKey, [number, number] | null> = {
    free: null,
    "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080],
    "4:5": [1080, 1350], "4:3": [1440, 1080],
  };
  function captureSize(): [number, number] {
    return EXPORT_RES[store.get().aspect] ?? [canvas.width, canvas.height];
  }
  function applyAspect() {
    const a = ASPECTS[store.get().aspect];
    const st = canvas.style;
    if (a == null) {
      st.width = "100%"; st.height = "100%"; st.left = "0"; st.top = "0"; st.transform = "";
      canvas.classList.remove("staged");
    } else {
      const maxW = window.innerWidth * 0.96, maxH = window.innerHeight * 0.96;
      let w = maxW, h = w / a;
      if (h > maxH) { h = maxH; w = h * a; }
      st.width = `${Math.round(w)}px`; st.height = `${Math.round(h)}px`;
      st.left = "50%"; st.top = "50%"; st.transform = "translate(-50%,-50%)";
      canvas.classList.add("staged");
    }
    renderer.resize();
  }

  let lastErr = "";
  let lastAspect: AspectKey | "" = "";

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
    if (err && err !== lastErr) toast(err, "warn");
    lastErr = err;
    renderer.setBitmaps(map);
  }

  let panelSig = "";
  // Rebuild the right panel on selection / pane-list changes, and also when a
  // pane's source or loaded media changes — those swap which controls are shown
  // (text fields vs. the import button). Plain value edits stay out of the sig
  // so typing/dragging doesn't blow away focus.
  const paneSig = (s: Scene) => `${s.selectedId}|${s.panes.map((p) => `${p.id}:${p.source}:${p.mediaName}`).join(",")}`;

  store.subscribe((scene) => {
    syncBitmaps(scene);
    renderer.setScene(scene);
    if (scene.aspect !== lastAspect) { lastAspect = scene.aspect; applyAspect(); }
    const sig = paneSig(scene);
    if (sig !== panelSig) { panelSig = sig; buildPanels(panelLeft, panelRight, store, callbacks); }
  });

  const callbacks = {
    onExport: async () => {
      // Render at the chosen format's real resolution, gizmo hidden.
      const [w, h] = captureSize();
      renderer.beginCapture(w, h);
      await exportPng(canvas);
      renderer.endCapture();
      toast(`PNG saved (${w}×${h})`, "success");
    },
    onLoadDemo: async () => {
      const body = document.createElement("div");
      body.className = "welcome";
      body.innerHTML = `<p>this wipes your current scene. load the demo anyway?</p>`;
      if (await formModal("load demo?", body, "load demo", "nah")) store.set(demoScene());
    },
    onShare: async () => {
      const url = buildShareUrl(window.location.href, store.get());
      window.history.replaceState(null, "", url);
      try {
        await navigator.clipboard.writeText(url);
        toast("Share link copied to clipboard", "success");
        if (store.get().panes.some((p) => p.source === "media" && p.mediaName)) {
          toast("Heads-up: imported media isn't in the link — others see a placeholder", "info", 4200);
        }
      } catch {
        // Clipboard blocked (permissions/insecure context) — the URL is the
        // only way to share, so fall back to showing it.
        dialog("Share link", `Clipboard was blocked. Copy this link manually:\n\n${url}`, "warn");
      }
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
        const { name, kind } = await importMediaForPane(id, file);
        // Cache the blob locally (content-hash keyed) so reloading a shared
        // link on this machine can restore the media; best-effort.
        const mediaId = await hashBlob(file).catch(() => "");
        if (mediaId) void putBlob(mediaId, file);
        // Drop any stale cached frame from a previous import on this pane, then
        // default media to a fine (near 1:1) grid so detail survives.
        renderer.clearMediaSample(id);
        store.update((s) => updateSelected(s, { source: "media", mediaName: name, mediaId, cellSize: 1 }));
        renderer.markDirty();
        toast(`Loaded ${kind}: ${name}`, "success");
      } catch (e) {
        dialog("Import failed", (e as Error).message, "error");
      }
    },
    onRemoveMedia: () => {
      const id = getSelected(store.get()).id;
      removeMedia(id);
      renderer.clearMediaSample(id);
      store.update((s) => updateSelected(s, { source: "text", mediaName: "", mediaId: "" }));
      renderer.markDirty();
      toast("Media removed", "info");
    },
    onRecord: async () => {
      // Settings modal: clip length + quality (low bitrate = crunchier/artsy).
      const body = document.createElement("div");
      body.className = "rec-form";
      body.innerHTML = `
        <label class="rec-row"><span>Length · <b id="rl">6</b>s</span>
          <input type="range" id="rec-len" min="1" max="30" step="1" value="6"></label>
        <label class="rec-row"><span>Quality · <b id="rq">6</b> Mbps</span>
          <input type="range" id="rec-q" min="0.5" max="12" step="0.5" value="6"></label>
        <p class="rec-hint">Lower quality = smaller file, crunchier artifacts.</p>`;
      const lenEl = body.querySelector("#rec-len") as HTMLInputElement;
      const qEl = body.querySelector("#rec-q") as HTMLInputElement;
      lenEl.addEventListener("input", () => { (body.querySelector("#rl") as HTMLElement).textContent = lenEl.value; });
      qEl.addEventListener("input", () => { (body.querySelector("#rq") as HTMLElement).textContent = qEl.value; });

      if (!(await formModal("Record WebM", body, "Record"))) return;
      const durSec = parseFloat(lenEl.value);
      const mbps = parseFloat(qEl.value);

      const btn = document.querySelector("#p-record") as HTMLButtonElement;
      const label = btn?.textContent;
      if (btn) { btn.disabled = true; btn.textContent = "Recording…"; }
      // Capture at the format resolution with the gizmo hidden for the whole clip.
      const [w, h] = captureSize();
      renderer.beginCapture(w, h);
      try {
        await recordWebm(canvas, durSec * 1000, 30, "junk-atelier.webm", mbps * 1e6);
        toast(`Clip saved (${w}×${h})`, "success");
      } catch (err) {
        dialog("Recording failed", (err as Error).message, "error");
      } finally {
        renderer.endCapture();
        if (btn) { btn.disabled = false; btn.textContent = label; }
      }
    },
  };

  // Initial paint + panel.
  syncBitmaps(store.get());
  renderer.setScene(store.get());
  lastAspect = store.get().aspect;
  applyAspect();
  panelSig = paneSig(store.get());
  buildPanels(panelLeft, panelRight, store, callbacks);

  attachControls(canvas, store, (x, y) => {
    const id = renderer.pickAt(x, y);
    // Hit a pane -> select it; click empty space -> clear selection (hides the
    // pane panel + gizmo).
    store.update((s) => (id ? selectPane(s, id) : { ...s, selectedId: "" }));
  }, {
    pick: (x, y) => renderer.pickGizmo(x, y),
    axisVec: (a) => renderer.gizmoAxisVec(a),
  });
  window.addEventListener("resize", applyAspect);
  document.getElementById("about-btn")?.addEventListener("click", () => showAbout(store));

  // Re-attach media blobs from the local IndexedDB cache for panes that carry a
  // mediaId (scene arrived via share link or gallery). Misses keep the
  // placeholder — blobs only exist on the machine that imported them.
  async function restoreSceneMedia() {
    let restored = 0;
    for (const p of store.get().panes) {
      if (p.source !== "media" || !p.mediaId || hasMedia(p.id)) continue;
      const blob = await getBlob(p.mediaId);
      if (!blob) continue;
      try {
        await loadMediaBlob(p.id, blob, p.mediaName);
        renderer.clearMediaSample(p.id);
        restored++;
      } catch { /* corrupt cache entry — leave the placeholder */ }
    }
    if (restored) {
      renderer.markDirty();
      toast(`Restored ${restored} media file${restored > 1 ? "s" : ""} from this device`, "info");
    }
  }
  if (window.location.hash) void restoreSceneMedia();

  const galleryBtn = document.getElementById("gallery-btn") as HTMLButtonElement | null;
  if (galleryBtn && !galleryEnabled) galleryBtn.style.display = "none";
  galleryBtn?.addEventListener("click", () => openGallery({
    getScene: () => serializeScene(store.get()),
    loadScene: async (entry) => {
      const body = document.createElement("div");
      body.className = "welcome";
      body.innerHTML = `<p>this wipes your current scene. load it anyway?</p>`;
      if (!(await formModal(`load "${entry.name}"?`, body, "load it", "nah"))) return;
      try {
        store.set(deserializeScene(entry.scene));
      } catch {
        toast("that entry is corrupted — skipping it", "error");
        return;
      }
      void restoreSceneMedia();
    },
  }));

  // First-visit intro. Skipped when arriving via a shared/demo hash. The store's
  // subscriber repaints + rebuilds panels, so loading the demo just needs a set().
  maybeShowWelcome(store);
}

const SEEN_KEY = "junkAtelier.seen.v1";

function welcomeBody(): HTMLDivElement {
  const body = document.createElement("div");
  body.className = "welcome";
  body.innerHTML = `
    <p>this is a random bs project that started as an experiment without a clear goal.</p>
    <p>i then saw a potential use for creating visuals with a strange taste; but maybe
       you'll find it another use.</p>
    <p>everything runs in your browser — nothing is uploaded anywhere. imported media
       stays on your machine, so share links carry your scene but not your files.</p>
    <p class="welcome-cta">start with a blank canvas, or load a little demo to poke at?</p>`;
  return body;
}

function maybeShowWelcome(store: ReturnType<typeof createStore>): void {
  if (window.location.hash) return; // shared link -> respect it, no intro
  let seen = false;
  try { seen = !!localStorage.getItem(SEEN_KEY); } catch { /* storage blocked */ }
  if (seen) return;

  formModal("Welcome to Junk Atelier", welcomeBody(), "Load demo", "Start blank").then((loadDemo) => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
    if (loadDemo) store.set(demoScene());
  });
}

// Re-opened any time via the About button. Unlike the first-visit flow, loading
// the demo from here can clobber real work, so it goes through a confirm.
function showAbout(store: ReturnType<typeof createStore>): void {
  formModal("Welcome to Junk Atelier", welcomeBody(), "load demo", "close").then(async (loadDemo) => {
    if (!loadDemo) return;
    const body = document.createElement("div");
    body.className = "welcome";
    body.innerHTML = `<p>this wipes your current scene. load the demo anyway?</p>`;
    if (await formModal("load demo?", body, "load demo", "nah")) store.set(demoScene());
  });
}

main();
