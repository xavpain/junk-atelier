import type { Background } from "../types";

// Draws the global 2D background in screen space (never transformed by camera).
// ts (ms) drives the optional animated fade.
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: Background,
  vp: { width: number; height: number },
  ts: number,
): void {
  const { width, height } = vp;

  if (bg.style === "solid" && bg.transparent && !bg.fade) return; // leave cleared

  let base = bg.color;
  if (bg.fade) {
    const t = (Math.sin(ts * 0.001 * Math.PI * bg.fadeSpeed) + 1) / 2;
    base = lerpHex(bg.color, bg.fadeColor, t);
  }

  if (!(bg.style === "solid" && bg.transparent)) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
  }

  const step = Math.max(2, Math.round(bg.spacing));
  if (bg.style === "grid") {
    ctx.strokeStyle = bg.accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0.5; x <= width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = 0.5; y <= height; y += step) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();
  } else if (bg.style === "dotted") {
    const rad = Math.max(0.5, bg.dotRadius);
    ctx.fillStyle = dotPattern(ctx, step, rad, bg.accent);
    ctx.fillRect(0, 0, width, height);
  }
}

// One dot rendered into a step×step tile, repeated as a fill pattern — replaces
// thousands of per-frame arc() calls with a single fillRect. Cached until
// spacing/radius/colour change.
let dotCache: { key: string; pattern: CanvasPattern } | null = null;

function dotPattern(ctx: CanvasRenderingContext2D, step: number, rad: number, accent: string): CanvasPattern {
  const key = `${step}|${rad}|${accent}`;
  if (dotCache?.key === key) return dotCache.pattern;
  const tile = document.createElement("canvas");
  tile.width = step; tile.height = step;
  const tctx = tile.getContext("2d")!;
  tctx.fillStyle = accent;
  tctx.beginPath();
  tctx.arc(step / 2, step / 2, rad, 0, Math.PI * 2);
  tctx.fill();
  const pattern = ctx.createPattern(tile, "repeat")!;
  dotCache = { key, pattern };
  return pattern;
}

function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexRgb(a), [br, bg, bb] = hexRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

// Memoized — called twice per frame while a background fade animates.
const hexCache = new Map<string, [number, number, number]>();

function hexRgb(hex: string): [number, number, number] {
  const hit = hexCache.get(hex);
  if (hit) return hit;
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const rgb: [number, number, number] = [
    parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16),
  ];
  if (hexCache.size > 256) hexCache.clear();
  hexCache.set(hex, rgb);
  return rgb;
}
