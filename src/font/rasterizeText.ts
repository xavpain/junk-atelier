import type { Bitmap } from "../types";
import { thresholdAlpha } from "./threshold";

const FONT_FAMILY = "Geist Pixel Square";
const FONT_PX = 64;        // offscreen render size; higher = more cells
const MAX_CELLS = 400_000; // safety cap (cols*rows)

let fontReady: Promise<void> | null = null;

export function loadGeistPixel(): Promise<void> {
  if (!fontReady) {
    fontReady = (async () => {
      // Triggers @font-face load; throws if the family never resolves.
      await document.fonts.load(`${FONT_PX}px '${FONT_FAMILY}'`);
      await document.fonts.ready;
      if (!document.fonts.check(`${FONT_PX}px '${FONT_FAMILY}'`)) {
        throw new Error(`Font '${FONT_FAMILY}' failed to load`);
      }
    })();
  }
  return fontReady;
}

// Renders text to an offscreen canvas and thresholds it into a Bitmap.
// Must be called after loadGeistPixel() resolves.
export function rasterizeText(text: string): Bitmap {
  if (text.length === 0) return { cols: 0, rows: 0, data: new Uint8Array(0) };

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const font = `${FONT_PX}px '${FONT_FAMILY}'`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || FONT_PX * 0.8;
  const descent = metrics.actualBoundingBoxDescent || FONT_PX * 0.2;
  const left = Math.max(0, Math.ceil(metrics.actualBoundingBoxLeft || 0));
  const width = Math.max(1, Math.ceil(metrics.width) + left);
  const height = Math.max(1, Math.ceil(ascent + descent));

  if (width * height > MAX_CELLS) {
    throw new Error("Text too large; reduce length or font size");
  }

  canvas.width = width;
  canvas.height = height;
  ctx.font = font;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  ctx.fillText(text, left, ascent);

  const { data } = ctx.getImageData(0, 0, width, height);
  return thresholdAlpha(data, width, height, 128);
}
