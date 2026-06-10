import type { Pane, ProjectedQuad } from "../types";
import type { CellBuffer, ColorCellGrid } from "./repixelate";

// Draws one pane's live cells as a single batched Path2D, filled with the pane's
// solid colour or a gradient across its quad, honouring per-pane alpha. All
// shapes go through Path2D so overlapping panes composite (alpha-blend) correctly.
export function drawPaneCells(
  ctx: CanvasRenderingContext2D,
  cells: CellBuffer,
  pane: Pane,
  quad: ProjectedQuad,
  cellSize: number,
): void {
  if (cells.count === 0) return;

  const path = new Path2D();
  const r = cellSize / 2;
  for (let i = 0; i < cells.count; i++) {
    const sx = cells.xy[i * 2], sy = cells.xy[i * 2 + 1];
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
    ? gradientForQuad(ctx, pane.id, quad, pane.color, pane.color2)
    : pane.color;
  ctx.fill(path);
  ctx.restore();
}

// Scratch canvas for media blits, grown as needed and reused across frames.
let mediaCanvas: HTMLCanvasElement | null = null;
let mediaCtx: CanvasRenderingContext2D | null = null;

// Draws sampled media cells in two steps: blit the grid-resolution RGBA patch
// onto a scratch canvas, then draw it scaled up by cellSize with smoothing off.
// One drawImage per pane instead of one fillStyle+fillRect per cell.
export function drawColorCells(
  ctx: CanvasRenderingContext2D,
  grid: ColorCellGrid,
  alpha: number,
  cellSize: number,
): void {
  if (grid.count === 0 || grid.cols === 0 || grid.rows === 0) return;

  if (!mediaCanvas || mediaCanvas.width < grid.cols || mediaCanvas.height < grid.rows) {
    mediaCanvas ??= document.createElement("canvas");
    mediaCanvas.width = Math.max(mediaCanvas.width, grid.cols);
    mediaCanvas.height = Math.max(mediaCanvas.height, grid.rows);
    mediaCtx = mediaCanvas.getContext("2d")!;
  }
  const img = new ImageData(
    grid.data.subarray(0, grid.cols * grid.rows * 4) as ImageDataArray,
    grid.cols,
    grid.rows,
  );
  mediaCtx!.putImageData(img, 0, 0);

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false; // each grid pixel becomes a crisp cell block
  ctx.drawImage(
    mediaCanvas, 0, 0, grid.cols, grid.rows,
    grid.gx0 * cellSize, grid.gy0 * cellSize, grid.cols * cellSize, grid.rows * cellSize,
  );
  ctx.restore();
}

// Gradients are GPU-side resources; for a static pane the quad AABB and colours
// don't change between paints, so cache per pane and rebuild only on change.
const gradientCache = new Map<string, { key: string; grad: CanvasGradient }>();

function gradientForQuad(
  ctx: CanvasRenderingContext2D,
  paneId: string,
  quad: ProjectedQuad,
  from: string,
  to: string,
): CanvasGradient {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of quad.corners) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  }
  const key = `${minX},${minY},${maxX},${maxY},${from},${to}`;
  const hit = gradientCache.get(paneId);
  if (hit?.key === key) return hit.grad;
  const grad = ctx.createLinearGradient(minX, minY, maxX, maxY);
  grad.addColorStop(0, from);
  grad.addColorStop(1, to);
  if (gradientCache.size > 128) gradientCache.clear(); // deleted panes leak slowly otherwise
  gradientCache.set(paneId, { key, grad });
  return grad;
}
