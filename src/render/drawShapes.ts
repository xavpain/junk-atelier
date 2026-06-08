import type { Pane, ProjectedQuad } from "../types";
import type { LiveCell, ColorCell } from "./repixelate";

// Draws one pane's live cells as a single batched Path2D, filled with the pane's
// solid colour or a gradient across its quad, honouring per-pane alpha. All
// shapes go through Path2D so overlapping panes composite (alpha-blend) correctly.
export function drawPaneCells(
  ctx: CanvasRenderingContext2D,
  cells: LiveCell[],
  pane: Pane,
  quad: ProjectedQuad,
  cellSize: number,
): void {
  if (cells.length === 0) return;

  const path = new Path2D();
  const r = cellSize / 2;
  for (const { sx, sy } of cells) {
    const cx = sx + r, cy = sy + r;
    switch (pane.shape) {
      case "square":
        path.rect(sx, sy, cellSize, cellSize);
        break;
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

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, pane.alpha));
  ctx.fillStyle = pane.colorMode === "gradient"
    ? gradientForQuad(ctx, quad, pane.color, pane.color2)
    : pane.color;
  ctx.fill(path);
  ctx.restore();
}

// Draws sampled media cells, each filled with its own colour. Per-cell fillStyle
// (no batching) since colours differ; pane alpha scales the whole layer.
export function drawColorCells(
  ctx: CanvasRenderingContext2D,
  cells: ColorCell[],
  alpha: number,
  cellSize: number,
): void {
  if (cells.length === 0) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  for (const c of cells) {
    ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${c.a / 255})`;
    ctx.fillRect(c.sx, c.sy, cellSize, cellSize);
  }
  ctx.restore();
}

function gradientForQuad(
  ctx: CanvasRenderingContext2D,
  quad: ProjectedQuad,
  from: string,
  to: string,
): CanvasGradient {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of quad.corners) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  }
  const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}
