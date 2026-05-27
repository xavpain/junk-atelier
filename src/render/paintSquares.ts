import type { LiveCell } from "./repixelate";

// Writes filled square cells directly into an RGBA buffer (the Square fast-path).
export function paintSquares(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  cells: LiveCell[],
  cellSize: number,
  rgba: [number, number, number, number],
): void {
  const [r, g, b, a] = rgba;
  for (const cell of cells) {
    for (let dy = 0; dy < cellSize; dy++) {
      const py = cell.sy + dy;
      if (py < 0 || py >= height) continue;
      for (let dx = 0; dx < cellSize; dx++) {
        const px = cell.sx + dx;
        if (px < 0 || px >= width) continue;
        const i = (py * width + px) * 4;
        buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
      }
    }
  }
}
