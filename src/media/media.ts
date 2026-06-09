import type { ColorBitmap } from "../types";

type Kind = "image" | "gif" | "video";

interface Entry {
  el: HTMLImageElement | HTMLVideoElement;
  kind: Kind;
  url: string;
}

const MAX_DIM = 320; // longest sampled edge; higher = finer (near 1:1) detail

const registry = new Map<string, Entry>();
const sampler = document.createElement("canvas");
const sctx = sampler.getContext("2d", { willReadFrequently: true })!;

// Imports a file as the media source for a pane. Returns once dimensions are
// known. Everything stays client-side via an object URL — nothing is uploaded.
export function importMediaForPane(paneId: string, file: File): Promise<{ name: string; kind: Kind }> {
  removeMedia(paneId);
  const url = URL.createObjectURL(file);
  const kind: Kind = file.type === "image/gif" ? "gif" : file.type.startsWith("video") ? "video" : "image";

  return new Promise((resolve, reject) => {
    if (kind === "video") {
      const v = document.createElement("video");
      v.src = url; v.loop = true; v.muted = true; v.playsInline = true;
      v.addEventListener("loadeddata", () => { v.play().catch(() => {}); resolve({ name: file.name, kind }); }, { once: true });
      v.addEventListener("error", () => reject(new Error("Failed to load video")), { once: true });
      registry.set(paneId, { el: v, kind, url });
    } else {
      const img = new Image();
      img.src = url;
      img.addEventListener("load", () => resolve({ name: file.name, kind }), { once: true });
      img.addEventListener("error", () => reject(new Error("Failed to load image")), { once: true });
      registry.set(paneId, { el: img, kind, url });
    }
  });
}

export function hasMedia(paneId: string): boolean {
  return registry.has(paneId);
}

export function removeMedia(paneId: string): void {
  const e = registry.get(paneId);
  if (!e) return;
  if (e.kind === "video") (e.el as HTMLVideoElement).pause();
  URL.revokeObjectURL(e.url);
  registry.delete(paneId);
}

// Samples the current media frame into a coarse RGBA grid. Returns null if the
// media is not ready yet. Dynamic (video/gif) grids are re-sampled each frame.
export function sampleMedia(paneId: string): ColorBitmap | null {
  const e = registry.get(paneId);
  if (!e) return null;
  const srcW = e.kind === "video" ? (e.el as HTMLVideoElement).videoWidth : (e.el as HTMLImageElement).naturalWidth;
  const srcH = e.kind === "video" ? (e.el as HTMLVideoElement).videoHeight : (e.el as HTMLImageElement).naturalHeight;
  if (!srcW || !srcH) return null;

  const scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH));
  const cols = Math.max(1, Math.round(srcW * scale));
  const rows = Math.max(1, Math.round(srcH * scale));
  sampler.width = cols; sampler.height = rows;
  sctx.clearRect(0, 0, cols, rows);
  try {
    sctx.drawImage(e.el, 0, 0, cols, rows);
  } catch {
    return null; // frame not decodable yet
  }
  const { data } = sctx.getImageData(0, 0, cols, rows);
  return { cols, rows, data, dynamic: e.kind !== "image" };
}
