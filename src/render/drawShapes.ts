import type { Shape } from "../types";
import type { LiveCell } from "./repixelate";
import { paintSquares } from "./paintSquares";

const COLOR: [number, number, number, number] = [237, 237, 237, 255]; // #ededed
const COLOR_CSS = "#ededed";

// Draws all live cells in one batched operation. Square uses the ImageData
// fast-path; other shapes batch into a single Path2D.
export function drawCells(
  ctx: CanvasRenderingContext2D,
  cells: LiveCell[],
  cellSize: number,
  shape: Shape,
  background: string,
  transparent: boolean,
): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (!transparent) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }

  if (shape === "square") {
    // putImageData overwrites the region, so the bg fill above would be lost;
    // bake the background into the buffer before painting cells.
    const img = ctx.createImageData(width, height);
    if (!transparent) fillRgba(img.data, hexToRgba(background));
    paintSquares(img.data, width, height, cells, cellSize, COLOR);
    ctx.putImageData(img, 0, 0);
    return;
  }

  if (cells.length === 0) return;

  const path = new Path2D();
  const r = cellSize / 2;
  for (const { sx, sy } of cells) {
    const cx = sx + r, cy = sy + r;
    switch (shape) {
      case "circle":
        path.moveTo(cx + r, cy);
        path.arc(cx, cy, r, 0, Math.PI * 2);
        break;
      case "triangle":
        path.moveTo(cx, sy);
        path.lineTo(sx + cellSize, sy + cellSize);
        path.lineTo(sx, sy + cellSize);
        path.closePath();
        break;
      case "grid":
        path.rect(sx + r / 2, sy + r / 2, r, r);
        break;
      case "line":
        path.rect(sx, cy - 1, cellSize, 2);
        break;
    }
  }
  ctx.fillStyle = COLOR_CSS;
  ctx.fill(path);
}

function hexToRgba(hex: string): [number, number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h.padEnd(6, "0").slice(0, 6);
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16), 255];
}

function fillRgba(data: Uint8ClampedArray, [r, g, b, a]: [number, number, number, number]): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  }
}
