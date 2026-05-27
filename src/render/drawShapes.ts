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
): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (cells.length === 0) return;

  if (shape === "square") {
    const img = ctx.createImageData(width, height);
    paintSquares(img.data, width, height, cells, cellSize, COLOR);
    ctx.putImageData(img, 0, 0);
    return;
  }

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
