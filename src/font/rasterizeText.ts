import type { Bitmap } from "../types";
import { thresholdAlpha } from "./threshold";

const DEFAULT_FAMILY = "Geist Pixel Square";
const FONT_PX = 64;        // offscreen render size; higher = more cells
const MAX_CELLS = 400_000; // safety cap (cols*rows)

// Catalog shown in the font picker. The bundled pixel font + a set of display
// fonts; non-system ones are loaded from Google Fonts (see index.html).
export const FONT_CATALOG = [
  "Geist Pixel Square",
  "Press Start 2P",
  "Silkscreen",
  "VT323",
  "Bungee",
  "Orbitron",
  "monospace",
  "serif",
  "system-ui",
  "Impact",
  "Georgia",
];

const loaded = new Map<string, Promise<void>>();

// Ensures a font family is ready to rasterize. System families resolve instantly.
export function ensureFont(family: string): Promise<void> {
  let pr = loaded.get(family);
  if (!pr) {
    pr = (async () => {
      try {
        await document.fonts.load(`${FONT_PX}px '${family}'`);
        await document.fonts.ready;
      } catch { /* fall back to whatever the browser substitutes */ }
    })();
    loaded.set(family, pr);
  }
  return pr;
}

export function loadGeistPixel(): Promise<void> {
  return ensureFont(DEFAULT_FAMILY);
}

// Renders text to an offscreen canvas and thresholds it into a Bitmap.
// thickness applies morphology: >0 dilates (bolder), <0 erodes (thinner).
// Call ensureFont(font) first so the glyphs are available.
export function rasterizeText(text: string, thickness = 0, family = DEFAULT_FAMILY): Bitmap {
  if (text.length === 0) return { cols: 0, rows: 0, data: new Uint8Array(0) };

  const lines = text.split("\n");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const font = `${FONT_PX}px '${family}'`;
  ctx.font = font;

  let ascent = FONT_PX * 0.8, descent = FONT_PX * 0.2, left = 0, maxWidth = 1;
  for (const line of lines) {
    const m = ctx.measureText(line);
    ascent = Math.max(ascent, m.actualBoundingBoxAscent || 0);
    descent = Math.max(descent, m.actualBoundingBoxDescent || 0);
    left = Math.max(left, Math.ceil(m.actualBoundingBoxLeft || 0));
    maxWidth = Math.max(maxWidth, Math.ceil(m.width));
  }
  const lineH = Math.ceil(ascent + descent);
  const width = Math.max(1, maxWidth + left);
  const height = Math.max(1, lineH * lines.length);

  if (width * height > MAX_CELLS) {
    throw new Error("Text too large; reduce length or font size");
  }

  canvas.width = width;
  canvas.height = height;
  ctx.font = font;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  lines.forEach((line, i) => ctx.fillText(line, left, ascent + i * lineH));

  const { data } = ctx.getImageData(0, 0, width, height);
  const bmp = thresholdAlpha(data, width, height, 128);
  return thickness === 0 ? bmp : morph(bmp, thickness);
}

// Applies |passes| iterations of 8-neighbour dilation (passes>0) or erosion
// (passes<0). Dilation pads the bitmap so grown pixels are not clipped.
export function morph(bmp: Bitmap, passes: number): Bitmap {
  const grow = passes > 0;
  const n = Math.abs(passes);
  const pad = grow ? n : 0;
  let cols = bmp.cols + pad * 2;
  let rows = bmp.rows + pad * 2;
  let cur = new Uint8Array(cols * rows);
  for (let y = 0; y < bmp.rows; y++) {
    cur.set(bmp.data.subarray(y * bmp.cols, (y + 1) * bmp.cols), (y + pad) * cols + pad);
  }

  for (let p = 0; p < n; p++) {
    const next = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let hit = false, all = true;
        for (let dy = -1; dy <= 1 && (grow ? !hit : all); dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy, xx = x + dx;
            const v = yy < 0 || yy >= rows || xx < 0 || xx >= cols ? 0 : cur[yy * cols + xx];
            if (grow) { if (v) { hit = true; break; } }
            else if (!v) { all = false; break; }
          }
        }
        next[y * cols + x] = grow ? (hit ? 1 : 0) : (all ? 1 : 0);
      }
    }
    cur = next;
  }
  return { cols, rows, data: cur };
}
