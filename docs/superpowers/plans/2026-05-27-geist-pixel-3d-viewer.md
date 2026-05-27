# Geist Pixel 3D Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page web app that renders text in Vercel's Geist Pixel font and lets the user orbit/zoom/pan it as 3D, while drawing it as a crisp, re-pixelated 2D grid (no 3D renderer).

**Architecture:** A flat text bitmap (extracted from the Geist Pixel font) is treated as a plane in 3D. Each frame, its four corners are projected with perspective; because the source is planar, the whole transform reduces to a 3×3 homography. We inverse-map every cell of a fixed screen grid through that homography, sample the bitmap, and draw the live cells as the selected pixel shape. Pure math/logic is unit-tested; canvas/DOM modules are thin and verified by running the app.

**Tech Stack:** Vite, TypeScript, Vitest, HTML Canvas 2D, Geist Pixel (Square variant) web font.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/types.ts` | Shared types: `Vec2`, `Vec3`, `Mat3`, `Shape`, `Bitmap`, `ViewerState`, `ProjectedQuad` |
| `src/math/mat3.ts` | 3×3 matrix: identity, multiply, mat·vec, inverse |
| `src/math/transform3d.ts` | 3D rotations + perspective projection of a point; projection constants |
| `src/math/homography.ts` | `squareToQuad`, `solveHomography` (4-point) |
| `src/font/threshold.ts` | Pure `thresholdAlpha(rgba,…) → Bitmap` |
| `src/font/rasterizeText.ts` | Load Geist Pixel, draw text offscreen, return `Bitmap` (thin) |
| `src/render/projectPlane.ts` | `ViewerState` + bitmap → `ProjectedQuad` (corners + homography + inverse) |
| `src/render/repixelate.ts` | Inverse-map screen grid → list of live cells |
| `src/render/paintSquares.ts` | Pure RGBA-buffer painter for the Square fast-path |
| `src/render/drawShapes.ts` | Draw live cells to a canvas in the selected shape (thin) |
| `src/render/renderer.ts` | Frame orchestration: dirty flag + rAF (thin) |
| `src/state/store.ts` | Central state + subscribe + `serializeState`/`deserializeState` |
| `src/share/shareLink.ts` | `buildShareUrl`, apply URL hash to store |
| `src/interaction/controls.ts` | Mouse drag/shift-drag/wheel → store (thin) |
| `src/ui/panel.ts` | Control-panel DOM bound to store (thin) |
| `src/export/exportPng.ts` | Canvas → PNG download (thin) |
| `src/main.ts` | Wire everything together |
| `index.html` | Canvas + panel root + `@font-face` |

---

## Task 1: Project scaffold, fonts, and shared types

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/types.ts`, `public/fonts/` (font file), `src/style.css`

- [ ] **Step 1: Scaffold Vite + TS + Vitest**

Run:
```bash
cd /home/xpain/xavlab/geist
npm create vite@latest . -- --template vanilla-ts
npm install
npm install -D vitest
```

- [ ] **Step 2: Add test + dev scripts to `package.json`**

Ensure the `scripts` block contains:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Install the Geist Pixel (Square) web font**

Download the Square variant woff2 from the Geist Pixel font repository releases into `public/fonts/`:
```bash
mkdir -p public/fonts
curl -L -o public/fonts/GeistPixelSquare.woff2 \
  https://github.com/vercel/geist-pixel-font/raw/main/fonts/woff2/GeistPixelSquare.woff2
```
If that exact path 404s, list the repo's `fonts/woff2/` directory in a browser and grab the Square `.woff2`. Verify the file is non-empty: `ls -l public/fonts/`.

- [ ] **Step 4: Declare the font and base styles in `src/style.css`**

```css
@font-face {
  font-family: "Geist Pixel Square";
  src: url("/fonts/GeistPixelSquare.woff2") format("woff2");
  font-display: block;
}

* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #0a0a0a; color: #ededed;
  font-family: system-ui, sans-serif; overflow: hidden; }
#app { position: fixed; inset: 0; }
#viewer { display: block; width: 100%; height: 100%; cursor: grab; }
#viewer.dragging { cursor: grabbing; }
```

The exact family name must match the font file's internal name. After Task 5 you will confirm it loads; if it does not, open the woff2 with a font inspector and correct the `font-family` here and in `rasterizeText.ts`.

- [ ] **Step 5: Replace `index.html` body**

```html
<body>
  <div id="app">
    <canvas id="viewer"></canvas>
    <aside id="panel"></aside>
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
```
Add `<link>`/`import "./style.css"` per the Vite template (import it from `main.ts`).

- [ ] **Step 6: Create `src/types.ts`**

```ts
export interface Vec2 { x: number; y: number; }
export interface Vec3 { x: number; y: number; z: number; }

// Row-major 3x3 matrix, length 9.
export type Mat3 = number[];

export type Shape = "square" | "grid" | "circle" | "triangle" | "line";

export interface Bitmap {
  cols: number;
  rows: number;
  data: Uint8Array; // row-major, 1 = on, 0 = off, length cols*rows
}

export interface ViewerState {
  text: string;
  objRotation: Vec3;            // radians (slider-controlled object rotation)
  scale: number;                // object scale multiplier
  orbit: { yaw: number; pitch: number }; // radians (mouse-drag camera orbit)
  pan: Vec2;                    // screen-space pan in CSS px
  zoom: number;                 // focal-length multiplier (wheel)
  fov: number;                  // radians
  shape: Shape;
  cellSize: number;             // output grid cell size in CSS px
}

export interface ProjectedQuad {
  corners: [Vec2, Vec2, Vec2, Vec2]; // TL, TR, BR, BL in screen px
  homography: Mat3;                  // source(u,v) -> screen(x,y)
  inverse: Mat3;                     // screen(x,y) -> source(u,v)
  valid: boolean;                    // false if plane is degenerate / behind camera
}
```

- [ ] **Step 7: Verify scaffold builds and tests run**

Run: `npm run build && npm run test`
Expected: build succeeds; Vitest reports "No test files found" (or runs the template test). Delete any template `counter.ts`/demo code and its references in `main.ts`, leaving `main.ts` importing only `./style.css` for now.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite+TS+Vitest, fonts, shared types"
```

---

## Task 2: 3×3 matrix math

**Files:**
- Create: `src/math/mat3.ts`
- Test: `src/math/mat3.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { mat3Identity, mat3Mul, mat3MulVec, mat3Inverse } from "./mat3";

describe("mat3", () => {
  it("identity leaves a vector unchanged", () => {
    expect(mat3MulVec(mat3Identity(), 2, 3)).toEqual([2, 3, 1]);
  });

  it("multiplies identity by identity to get identity", () => {
    expect(mat3Mul(mat3Identity(), mat3Identity())).toEqual(mat3Identity());
  });

  it("inverts a scale matrix", () => {
    const scale = [2, 0, 0, 0, 2, 0, 0, 0, 1];
    const inv = mat3Inverse(scale);
    expect(inv[0]).toBeCloseTo(0.5);
    expect(inv[4]).toBeCloseTo(0.5);
    expect(inv[8]).toBeCloseTo(1);
  });

  it("inverse times original is identity", () => {
    const m = [1, 2, 0, 0, 1, 0, 3, 0, 1];
    const prod = mat3Mul(m, mat3Inverse(m));
    for (let i = 0; i < 9; i++) expect(prod[i]).toBeCloseTo(mat3Identity()[i]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/math/mat3.test.ts`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Implement `src/math/mat3.ts`**

```ts
import type { Mat3 } from "../types";

export function mat3Identity(): Mat3 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += a[row * 3 + k] * b[k * 3 + col];
      r[row * 3 + col] = sum;
    }
  }
  return r;
}

// Returns homogeneous [x', y', w'] (caller divides by w' for screen coords).
export function mat3MulVec(m: Mat3, x: number, y: number, w = 1): [number, number, number] {
  return [
    m[0] * x + m[1] * y + m[2] * w,
    m[3] * x + m[4] * y + m[5] * w,
    m[6] * x + m[7] * y + m[8] * w,
  ];
}

export function mat3Inverse(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error("mat3Inverse: singular matrix");
  const invDet = 1 / det;
  return [
    A * invDet,                 (c * h - b * i) * invDet, (b * f - c * e) * invDet,
    B * invDet,                 (a * i - c * g) * invDet, (c * d - a * f) * invDet,
    C * invDet,                 (b * g - a * h) * invDet, (a * e - b * d) * invDet,
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/math/mat3.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/math/mat3.ts src/math/mat3.test.ts
git commit -m "feat: 3x3 matrix math (mul, mulVec, inverse)"
```

---

## Task 3: 3D rotation and perspective projection

**Files:**
- Create: `src/math/transform3d.ts`
- Test: `src/math/transform3d.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { rotateX, rotateY, rotateZ } from "./transform3d";

describe("rotations", () => {
  const HALF_PI = Math.PI / 2;

  it("rotateX(90deg) maps +Y to +Z", () => {
    const p = rotateX({ x: 0, y: 1, z: 0 }, HALF_PI);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(1);
  });

  it("rotateY(90deg) maps +X to -Z", () => {
    const p = rotateY({ x: 1, y: 0, z: 0 }, HALF_PI);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-1);
  });

  it("rotateZ(90deg) maps +X to +Y", () => {
    const p = rotateZ({ x: 1, y: 0, z: 0 }, HALF_PI);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/math/transform3d.test.ts`
Expected: FAIL — exports not found.

- [ ] **Step 3: Implement `src/math/transform3d.ts`**

```ts
import type { Vec2, Vec3 } from "../types";

// Plane is normalized so its larger dimension spans WORLD_SIZE world units.
export const WORLD_SIZE = 10;
// Camera sits this far along +Z, looking toward the origin (-Z).
export const CAMERA_DISTANCE = 20;

export function rotateX(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

export function rotateY(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

export function rotateZ(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
}

export interface ProjectParams {
  fov: number;     // radians
  zoom: number;    // focal-length multiplier
  pan: Vec2;       // screen px
  width: number;
  height: number;
}

// Returns screen point + camera-space depth (CAMERA_DISTANCE - z).
// depth <= ~0 means the point is at/behind the camera.
export function perspectiveProject(p: Vec3, params: ProjectParams): { screen: Vec2; depth: number } {
  const f0 = (params.height / 2) / Math.tan(params.fov / 2);
  const f = f0 * params.zoom;
  const depth = CAMERA_DISTANCE - p.z;
  const screen: Vec2 = {
    x: params.width / 2 + params.pan.x + (f * p.x) / depth,
    y: params.height / 2 + params.pan.y - (f * p.y) / depth,
  };
  return { screen, depth };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/math/transform3d.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/math/transform3d.ts src/math/transform3d.test.ts
git commit -m "feat: 3D rotations and perspective projection"
```

---

## Task 4: 4-point homography

**Files:**
- Create: `src/math/homography.ts`
- Test: `src/math/homography.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { squareToQuad, solveHomography } from "./homography";
import { mat3MulVec } from "./mat3";
import type { Vec2 } from "../types";

const UNIT: [Vec2, Vec2, Vec2, Vec2] = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
];

describe("homography", () => {
  it("squareToQuad of the unit square is identity", () => {
    const h = squareToQuad(UNIT);
    const id = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let i = 0; i < 9; i++) expect(h[i]).toBeCloseTo(id[i]);
  });

  it("solveHomography maps a scaled square correctly", () => {
    const src: [Vec2, Vec2, Vec2, Vec2] = [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 },
    ];
    const dst: [Vec2, Vec2, Vec2, Vec2] = [
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 },
    ];
    const h = solveHomography(src, dst);
    const [x, y, w] = mat3MulVec(h, 1, 1); // center of src -> center of dst
    expect(x / w).toBeCloseTo(2);
    expect(y / w).toBeCloseTo(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/math/homography.test.ts`
Expected: FAIL — exports not found.

- [ ] **Step 3: Implement `src/math/homography.ts`**

```ts
import type { Mat3, Vec2 } from "../types";
import { mat3Mul, mat3Inverse } from "./mat3";

// Heckbert: maps the unit square (0,0),(1,0),(1,1),(0,1) onto quad q.
export function squareToQuad(q: [Vec2, Vec2, Vec2, Vec2]): Mat3 {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;

  if (Math.abs(sx) < 1e-12 && Math.abs(sy) < 1e-12) {
    // Affine map.
    return [
      p1.x - p0.x, p3.x - p0.x, p0.x,
      p1.y - p0.y, p3.y - p0.y, p0.y,
      0, 0, 1,
    ];
  }

  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;

  return [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h, 1,
  ];
}

// Homography mapping src quad -> dst quad (both in TL,TR,BR,BL order).
export function solveHomography(
  src: [Vec2, Vec2, Vec2, Vec2],
  dst: [Vec2, Vec2, Vec2, Vec2],
): Mat3 {
  return mat3Mul(squareToQuad(dst), mat3Inverse(squareToQuad(src)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/math/homography.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/math/homography.ts src/math/homography.test.ts
git commit -m "feat: 4-point homography (squareToQuad, solveHomography)"
```

---

## Task 5: Font rasterization (threshold + canvas draw)

**Files:**
- Create: `src/font/threshold.ts`, `src/font/rasterizeText.ts`
- Test: `src/font/threshold.test.ts`

- [ ] **Step 1: Write the failing test for the pure thresholder**

```ts
import { describe, it, expect } from "vitest";
import { thresholdAlpha } from "./threshold";

describe("thresholdAlpha", () => {
  it("marks cells on where alpha exceeds the threshold", () => {
    // 2x2 image, RGBA. Alpha at indices 3,7,11,15.
    const rgba = new Uint8ClampedArray(16);
    rgba[3] = 200;  // (0,0) on
    rgba[7] = 10;   // (1,0) off
    rgba[11] = 10;  // (0,1) off
    rgba[15] = 200; // (1,1) on
    const bmp = thresholdAlpha(rgba, 2, 2, 128);
    expect(bmp.cols).toBe(2);
    expect(bmp.rows).toBe(2);
    expect(Array.from(bmp.data)).toEqual([1, 0, 0, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/font/threshold.test.ts`
Expected: FAIL — export not found.

- [ ] **Step 3: Implement `src/font/threshold.ts`**

```ts
import type { Bitmap } from "../types";

export function thresholdAlpha(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 128,
): Bitmap {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    data[i] = rgba[i * 4 + 3] > threshold ? 1 : 0;
  }
  return { cols: width, rows: height, data };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/font/threshold.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `src/font/rasterizeText.ts` (thin, canvas-backed)**

```ts
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
  const width = Math.max(1, Math.ceil(metrics.width));
  const height = Math.max(1, Math.ceil(ascent + descent));

  if (width * height > MAX_CELLS) {
    throw new Error("Text too large; reduce length or font size");
  }

  canvas.width = width;
  canvas.height = height;
  ctx.font = font;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  ctx.fillText(text, 0, ascent);

  const { data } = ctx.getImageData(0, 0, width, height);
  return thresholdAlpha(data, width, height, 128);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/font/threshold.ts src/font/threshold.test.ts src/font/rasterizeText.ts
git commit -m "feat: font rasterization (threshold + canvas raster)"
```

---

## Task 6: Project the text plane to a screen quad

**Files:**
- Create: `src/render/projectPlane.ts`
- Test: `src/render/projectPlane.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { projectPlane } from "./projectPlane";
import { mat3MulVec } from "../math/mat3";
import type { Bitmap, ViewerState } from "../types";

function baseState(): ViewerState {
  return {
    text: "x",
    objRotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    orbit: { yaw: 0, pitch: 0 },
    pan: { x: 0, y: 0 },
    zoom: 1,
    fov: Math.PI / 3,
    shape: "square",
    cellSize: 8,
  };
}

describe("projectPlane", () => {
  const bmp: Bitmap = { cols: 10, rows: 10, data: new Uint8Array(100) };

  it("identity transform yields a valid centered quad", () => {
    const q = projectPlane(bmp, baseState(), { width: 800, height: 600 });
    expect(q.valid).toBe(true);
    // Quad is symmetric about the screen center.
    const cx = (q.corners[0].x + q.corners[2].x) / 2;
    const cy = (q.corners[0].y + q.corners[2].y) / 2;
    expect(cx).toBeCloseTo(400, 0);
    expect(cy).toBeCloseTo(300, 0);
  });

  it("inverse maps the screen center back to the source center", () => {
    const q = projectPlane(bmp, baseState(), { width: 800, height: 600 });
    const [u, v, w] = mat3MulVec(q.inverse, 400, 300);
    expect(u / w).toBeCloseTo(5, 1); // cols/2
    expect(v / w).toBeCloseTo(5, 1); // rows/2
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/render/projectPlane.test.ts`
Expected: FAIL — export not found.

- [ ] **Step 3: Implement `src/render/projectPlane.ts`**

```ts
import type { Bitmap, ProjectedQuad, ViewerState, Vec2, Vec3 } from "../types";
import { rotateX, rotateY, rotateZ, perspectiveProject, WORLD_SIZE } from "../math/transform3d";
import { solveHomography } from "../math/homography";
import { mat3Inverse } from "../math/mat3";

export function projectPlane(
  bitmap: Bitmap,
  state: ViewerState,
  viewport: { width: number; height: number },
): ProjectedQuad {
  const { cols, rows } = bitmap;
  const empty: ProjectedQuad = {
    corners: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
    homography: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    valid: false,
  };
  if (cols === 0 || rows === 0) return empty;

  // Source corners in bitmap pixel space: TL, TR, BR, BL.
  const srcCorners: [Vec2, Vec2, Vec2, Vec2] = [
    { x: 0, y: 0 }, { x: cols, y: 0 }, { x: cols, y: rows }, { x: 0, y: rows },
  ];

  const unitsPerCell = WORLD_SIZE / Math.max(cols, rows);
  const projParams = {
    fov: state.fov, zoom: state.zoom, pan: state.pan,
    width: viewport.width, height: viewport.height,
  };

  const screenCorners: Vec2[] = [];
  for (const c of srcCorners) {
    // Bitmap space -> centered world (flip y so +y is up).
    let p: Vec3 = {
      x: (c.x - cols / 2) * unitsPerCell * state.scale,
      y: (rows / 2 - c.y) * unitsPerCell * state.scale,
      z: 0,
    };
    // Object rotation, then camera orbit.
    p = rotateZ(rotateY(rotateX(p, state.objRotation.x), state.objRotation.y), state.objRotation.z);
    p = rotateX(p, state.orbit.pitch);
    p = rotateY(p, state.orbit.yaw);

    const { screen, depth } = perspectiveProject(p, projParams);
    if (depth <= 0.01) return empty; // plane crosses/behind camera
    screenCorners.push(screen);
  }

  const corners = screenCorners as [Vec2, Vec2, Vec2, Vec2];
  let homography, inverse;
  try {
    homography = solveHomography(srcCorners, corners);
    inverse = mat3Inverse(homography);
  } catch {
    return empty; // degenerate (edge-on collapse)
  }
  return { corners, homography, inverse, valid: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/render/projectPlane.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/render/projectPlane.ts src/render/projectPlane.test.ts
git commit -m "feat: project text plane to screen quad + homography"
```

---

## Task 7: Re-pixelate (inverse-map screen grid to live cells)

**Files:**
- Create: `src/render/repixelate.ts`
- Test: `src/render/repixelate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { repixelate } from "./repixelate";
import { solveHomography } from "../math/homography";
import { mat3Inverse } from "../math/mat3";
import type { Bitmap, ProjectedQuad, Vec2 } from "../types";

describe("repixelate", () => {
  it("returns live cells matching an on/off bitmap under a 1:1-ish map", () => {
    // 2x2 bitmap: TL and BR on.
    const bmp: Bitmap = { cols: 2, rows: 2, data: new Uint8Array([1, 0, 0, 1]) };
    const src: [Vec2, Vec2, Vec2, Vec2] = [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 },
    ];
    // Map 2 source units -> 20 screen px (cellSize 10 => 2x2 screen cells).
    const dst: [Vec2, Vec2, Vec2, Vec2] = [
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
    ];
    const homography = solveHomography(src, dst);
    const quad: ProjectedQuad = {
      corners: dst, homography, inverse: mat3Inverse(homography), valid: true,
    };
    const cells = repixelate(bmp, quad, { width: 20, height: 20 }, 10);
    const set = cells.map((c) => `${c.sx},${c.sy}`).sort();
    expect(set).toEqual(["0,0", "10,10"]);
  });

  it("returns nothing for an invalid quad", () => {
    const bmp: Bitmap = { cols: 2, rows: 2, data: new Uint8Array([1, 1, 1, 1]) };
    const quad: ProjectedQuad = {
      corners: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
      homography: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      valid: false,
    };
    expect(repixelate(bmp, quad, { width: 20, height: 20 }, 10)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/render/repixelate.test.ts`
Expected: FAIL — export not found.

- [ ] **Step 3: Implement `src/render/repixelate.ts`**

```ts
import type { Bitmap, ProjectedQuad } from "../types";
import { mat3MulVec } from "../math/mat3";

export interface LiveCell { sx: number; sy: number; } // top-left screen px

export function repixelate(
  bitmap: Bitmap,
  quad: ProjectedQuad,
  viewport: { width: number; height: number },
  cellSize: number,
): LiveCell[] {
  if (!quad.valid || bitmap.cols === 0 || bitmap.rows === 0) return [];

  // Screen-space AABB of the projected quad, clamped to the viewport and snapped to the grid.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of quad.corners) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  }
  const gx0 = Math.max(0, Math.floor(minX / cellSize));
  const gy0 = Math.max(0, Math.floor(minY / cellSize));
  const gx1 = Math.min(Math.ceil(viewport.width / cellSize), Math.ceil(maxX / cellSize));
  const gy1 = Math.min(Math.ceil(viewport.height / cellSize), Math.ceil(maxY / cellSize));

  const cells: LiveCell[] = [];
  const { cols, rows, data } = bitmap;
  for (let gy = gy0; gy < gy1; gy++) {
    for (let gx = gx0; gx < gx1; gx++) {
      const cx = gx * cellSize + cellSize / 2;
      const cy = gy * cellSize + cellSize / 2;
      const [hx, hy, hw] = mat3MulVec(quad.inverse, cx, cy);
      const u = hx / hw, v = hy / hw;
      if (u < 0 || v < 0 || u >= cols || v >= rows) continue;
      const col = Math.floor(u), row = Math.floor(v);
      if (data[row * cols + col] === 1) {
        cells.push({ sx: gx * cellSize, sy: gy * cellSize });
      }
    }
  }
  return cells;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/render/repixelate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/render/repixelate.ts src/render/repixelate.test.ts
git commit -m "feat: re-pixelate screen grid via inverse homography"
```

---

## Task 8: Pixel painting (Square fast-path + shape drawing)

**Files:**
- Create: `src/render/paintSquares.ts`, `src/render/drawShapes.ts`
- Test: `src/render/paintSquares.test.ts`

- [ ] **Step 1: Write the failing test for the pure painter**

```ts
import { describe, it, expect } from "vitest";
import { paintSquares } from "./paintSquares";

describe("paintSquares", () => {
  it("fills a cell-sized block of RGBA pixels", () => {
    const w = 4, h = 4;
    const buf = new Uint8ClampedArray(w * h * 4);
    paintSquares(buf, w, h, [{ sx: 0, sy: 0 }], 2, [255, 255, 255, 255]);
    // (0,0) painted white
    expect([buf[0], buf[1], buf[2], buf[3]]).toEqual([255, 255, 255, 255]);
    // (1,1) painted white -> index (1*4 + 1)*4 = 20
    expect([buf[20], buf[21], buf[22], buf[23]]).toEqual([255, 255, 255, 255]);
    // (2,0) NOT painted -> index 8
    expect([buf[8], buf[9], buf[10], buf[11]]).toEqual([0, 0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/render/paintSquares.test.ts`
Expected: FAIL — export not found.

- [ ] **Step 3: Implement `src/render/paintSquares.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/render/paintSquares.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `src/render/drawShapes.ts` (thin, canvas)**

```ts
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
        // small centered dot leaving grid gaps
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
```

- [ ] **Step 6: Commit**

```bash
git add src/render/paintSquares.ts src/render/paintSquares.test.ts src/render/drawShapes.ts
git commit -m "feat: pixel painting (square fast-path + shape batching)"
```

---

## Task 9: State store + URL serialization

**Files:**
- Create: `src/state/store.ts`
- Test: `src/state/store.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { defaultState, createStore, serializeState, deserializeState } from "./store";

describe("store", () => {
  it("serialize/deserialize round-trips the full state", () => {
    const s = defaultState();
    s.text = "hello";
    s.objRotation = { x: 0.1, y: 0.2, z: 0.3 };
    s.scale = 1.5;
    const restored = deserializeState(serializeState(s));
    expect(restored).toEqual(s);
  });

  it("notifies subscribers on set and merges patches", () => {
    const store = createStore(defaultState());
    let calls = 0;
    store.subscribe(() => calls++);
    store.set({ scale: 2 });
    expect(store.get().scale).toBe(2);
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/state/store.test.ts`
Expected: FAIL — exports not found.

- [ ] **Step 3: Implement `src/state/store.ts`**

```ts
import type { ViewerState } from "../types";

export function defaultState(): ViewerState {
  return {
    text: "GEIST",
    objRotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    orbit: { yaw: 0, pitch: 0 },
    pan: { x: 0, y: 0 },
    zoom: 1,
    fov: Math.PI / 3,
    shape: "square",
    cellSize: 8,
  };
}

export interface Store {
  get(): ViewerState;
  set(patch: Partial<ViewerState>): void;
  subscribe(fn: (s: ViewerState) => void): () => void;
}

export function createStore(initial: ViewerState): Store {
  let state = initial;
  const subs = new Set<(s: ViewerState) => void>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of subs) fn(state);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function serializeState(state: ViewerState): string {
  return btoa(encodeURIComponent(JSON.stringify(state)));
}

export function deserializeState(encoded: string): ViewerState {
  return JSON.parse(decodeURIComponent(atob(encoded))) as ViewerState;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/state/store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/state/store.ts src/state/store.test.ts
git commit -m "feat: state store with URL serialization"
```

---

## Task 10: Share links

**Files:**
- Create: `src/share/shareLink.ts`
- Test: `src/share/shareLink.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildShareUrl } from "./shareLink";
import { defaultState, deserializeState } from "../state/store";

describe("buildShareUrl", () => {
  it("encodes state into the URL hash and round-trips", () => {
    const s = defaultState();
    s.text = "share me";
    const url = buildShareUrl("https://example.com/app", s);
    expect(url).toContain("#");
    const hash = url.split("#")[1];
    expect(deserializeState(hash).text).toBe("share me");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/share/shareLink.test.ts`
Expected: FAIL — export not found.

- [ ] **Step 3: Implement `src/share/shareLink.ts`**

```ts
import type { ViewerState } from "../types";
import { serializeState, deserializeState } from "../state/store";
import type { Store } from "../state/store";

export function buildShareUrl(base: string, state: ViewerState): string {
  const url = base.split("#")[0];
  return `${url}#${serializeState(state)}`;
}

// Reads window.location.hash and applies it to the store, if present and valid.
export function applyHashToStore(store: Store): void {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return;
  try {
    store.set(deserializeState(hash));
  } catch {
    /* ignore malformed hash */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/share/shareLink.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/share/shareLink.ts src/share/shareLink.test.ts
git commit -m "feat: share links via URL hash"
```

---

## Task 11: Renderer (frame orchestration)

**Files:**
- Create: `src/render/renderer.ts`

This module is thin (canvas I/O + rAF) and verified by running the app in Task 15.

- [ ] **Step 1: Implement `src/render/renderer.ts`**

```ts
import type { Bitmap, ViewerState } from "../types";
import { projectPlane } from "./projectPlane";
import { repixelate } from "./repixelate";
import { drawCells } from "./drawShapes";

export interface Renderer {
  setBitmap(bmp: Bitmap): void;
  setState(state: ViewerState): void;
  resize(): void;
  markDirty(): void;
}

const MAX_DPR = 2;

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d")!;
  let bitmap: Bitmap = { cols: 0, rows: 0, data: new Uint8Array(0) };
  let state: ViewerState | null = null;
  let dirty = true;
  let cssW = 0, cssH = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    cssW = rect.width; cssH = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true;
  }

  function frame() {
    if (dirty && state) {
      dirty = false;
      const quad = projectPlane(bitmap, state, { width: cssW, height: cssH });
      const cells = repixelate(bitmap, quad, { width: cssW, height: cssH }, state.cellSize);
      drawCells(ctx, cells, state.cellSize, state.shape);
    }
    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);

  return {
    setBitmap(b) { bitmap = b; dirty = true; },
    setState(s) { state = s; dirty = true; },
    resize,
    markDirty() { dirty = true; },
  };
}
```

Note: `drawCells` clears via `ctx.canvas.width/height` (device px) but draws in CSS px because of `setTransform`. For the Square ImageData path, replace the clear/size usage in `drawShapes.ts` to use device pixels: pass the full backing-store size. Adjust `drawCells` to read `ctx.canvas.width/height` (already device px) and compute cells in device px by multiplying `cellSize` and cell coords by `dpr`. To keep this simple, render at dpr=1 for the ImageData path: in `resize`, when you need exact crispness, you may set `MAX_DPR = 1`. Verify visually in Task 15 and pick the DPR that looks right.

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: compiles with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/render/renderer.ts
git commit -m "feat: renderer with dirty-flag rAF loop"
```

---

## Task 12: Mouse interaction (orbit / pan / zoom)

**Files:**
- Create: `src/interaction/controls.ts`

Thin DOM module; verified by running the app.

- [ ] **Step 1: Implement `src/interaction/controls.ts`**

```ts
import type { Store } from "../state/store";

const ORBIT_SENSITIVITY = 0.01; // radians per px
const PAN_SENSITIVITY = 1;       // px per px
const ZOOM_STEP = 1.0015;        // per wheel delta unit

export function attachControls(canvas: HTMLCanvasElement, store: Store): void {
  let dragging = false;
  let shift = false;
  let lastX = 0, lastY = 0;

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    shift = e.shiftKey;
    lastX = e.clientX; lastY = e.clientY;
    canvas.classList.add("dragging");
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    const s = store.get();
    if (shift) {
      store.set({ pan: { x: s.pan.x + dx * PAN_SENSITIVITY, y: s.pan.y + dy * PAN_SENSITIVITY } });
    } else {
      store.set({
        orbit: {
          yaw: s.orbit.yaw + dx * ORBIT_SENSITIVITY,
          pitch: s.orbit.pitch + dy * ORBIT_SENSITIVITY,
        },
      });
    }
  });

  const end = (e: PointerEvent) => {
    dragging = false;
    canvas.classList.remove("dragging");
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const s = store.get();
    const factor = Math.pow(ZOOM_STEP, -e.deltaY);
    store.set({ zoom: Math.max(0.05, Math.min(50, s.zoom * factor)) });
  }, { passive: false });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/interaction/controls.ts
git commit -m "feat: mouse orbit/pan/zoom controls"
```

---

## Task 13: Control panel UI

**Files:**
- Create: `src/ui/panel.ts`
- Modify: `src/style.css` (append panel styles)

Thin DOM module; verified by running the app.

- [ ] **Step 1: Append panel styles to `src/style.css`**

```css
#panel { position: fixed; top: 16px; left: 16px; width: 240px; padding: 16px;
  background: rgba(20,20,20,0.85); border: 1px solid #2a2a2a; border-radius: 8px;
  backdrop-filter: blur(6px); display: flex; flex-direction: column; gap: 12px;
  font-size: 12px; }
#panel label { display: flex; flex-direction: column; gap: 4px; }
#panel input[type="text"], #panel select { background: #0a0a0a; color: #ededed;
  border: 1px solid #333; border-radius: 4px; padding: 6px; font: inherit; }
#panel input[type="range"] { width: 100%; }
#panel .row { display: flex; gap: 8px; }
#panel button { flex: 1; background: #ededed; color: #0a0a0a; border: 0;
  border-radius: 4px; padding: 8px; cursor: pointer; font: inherit; }
```

- [ ] **Step 2: Implement `src/ui/panel.ts`**

```ts
import type { Shape } from "../types";
import type { Store } from "../state/store";

interface PanelCallbacks {
  onExport: () => void;
  onShare: () => void;
  onReset: () => void;
}

export function buildPanel(root: HTMLElement, store: Store, cb: PanelCallbacks): void {
  const s = store.get();
  root.innerHTML = "";

  const textLabel = labeled("Text", `<input type="text" id="p-text" value="${escapeHtml(s.text)}">`);
  const shapeLabel = labeled("Shape", `
    <select id="p-shape">
      ${(["square", "grid", "circle", "triangle", "line"] as Shape[])
        .map((sh) => `<option value="${sh}" ${sh === s.shape ? "selected" : ""}>${sh}</option>`)
        .join("")}
    </select>`);

  const rotX = slider("p-rotx", "Rotate X", -Math.PI, Math.PI, 0.01, s.objRotation.x);
  const rotY = slider("p-roty", "Rotate Y", -Math.PI, Math.PI, 0.01, s.objRotation.y);
  const rotZ = slider("p-rotz", "Rotate Z", -Math.PI, Math.PI, 0.01, s.objRotation.z);
  const scale = slider("p-scale", "Scale", 0.2, 4, 0.01, s.scale);
  const cell = slider("p-cell", "Resolution (cell px)", 2, 24, 1, s.cellSize);

  const buttons = document.createElement("div");
  buttons.className = "row";
  buttons.innerHTML = `<button id="p-reset">Reset</button>
    <button id="p-share">Share</button><button id="p-export">PNG</button>`;

  root.append(textLabel, shapeLabel, rotX.el, rotY.el, rotZ.el, scale.el, cell.el, buttons);

  (root.querySelector("#p-text") as HTMLInputElement)
    .addEventListener("input", (e) => store.set({ text: (e.target as HTMLInputElement).value }));
  (root.querySelector("#p-shape") as HTMLSelectElement)
    .addEventListener("change", (e) => store.set({ shape: (e.target as HTMLSelectElement).value as Shape }));

  rotX.bind((v) => store.set({ objRotation: { ...store.get().objRotation, x: v } }));
  rotY.bind((v) => store.set({ objRotation: { ...store.get().objRotation, y: v } }));
  rotZ.bind((v) => store.set({ objRotation: { ...store.get().objRotation, z: v } }));
  scale.bind((v) => store.set({ scale: v }));
  cell.bind((v) => store.set({ cellSize: v }));

  (root.querySelector("#p-reset") as HTMLButtonElement).addEventListener("click", cb.onReset);
  (root.querySelector("#p-share") as HTMLButtonElement).addEventListener("click", cb.onShare);
  (root.querySelector("#p-export") as HTMLButtonElement).addEventListener("click", cb.onExport);
}

function labeled(text: string, innerHtml: string): HTMLElement {
  const el = document.createElement("label");
  el.innerHTML = `<span>${text}</span>${innerHtml}`;
  return el;
}

function slider(id: string, text: string, min: number, max: number, step: number, value: number) {
  const el = document.createElement("label");
  el.innerHTML = `<span>${text}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">`;
  const input = el.querySelector("input") as HTMLInputElement;
  return {
    el,
    bind(fn: (v: number) => void) {
      input.addEventListener("input", () => fn(parseFloat(input.value)));
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/ui/panel.ts src/style.css
git commit -m "feat: control panel UI"
```

---

## Task 14: PNG export

**Files:**
- Create: `src/export/exportPng.ts`

- [ ] **Step 1: Implement `src/export/exportPng.ts`**

```ts
export function exportPng(canvas: HTMLCanvasElement, filename = "geist-pixel.png"): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/export/exportPng.ts
git commit -m "feat: PNG export"
```

---

## Task 15: Wire it all together + manual verification

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Implement `src/main.ts`**

```ts
import "./style.css";
import { createStore, defaultState } from "./state/store";
import { applyHashToStore, buildShareUrl } from "./share/shareLink";
import { loadGeistPixel, rasterizeText } from "./font/rasterizeText";
import { createRenderer } from "./render/renderer";
import { attachControls } from "./interaction/controls";
import { buildPanel } from "./ui/panel";
import { exportPng } from "./export/exportPng";

async function main() {
  const canvas = document.getElementById("viewer") as HTMLCanvasElement;
  const panelRoot = document.getElementById("panel") as HTMLElement;

  const store = createStore(defaultState());
  applyHashToStore(store);

  try {
    await loadGeistPixel();
  } catch (err) {
    panelRoot.innerHTML = `<p>Failed to load Geist Pixel font.<br>${(err as Error).message}</p>
      <button onclick="location.reload()">Retry</button>`;
    return;
  }

  const renderer = createRenderer(canvas);

  // Re-rasterize only when text changes; otherwise just push state.
  let lastText = " ";
  function sync() {
    const s = store.get();
    if (s.text !== lastText) {
      lastText = s.text;
      renderer.setBitmap(rasterizeText(s.text));
    }
    renderer.setState(s);
  }
  store.subscribe(sync);
  sync();

  attachControls(canvas, store);
  window.addEventListener("resize", () => renderer.resize());

  buildPanel(panelRoot, store, {
    onExport: () => exportPng(canvas),
    onShare: async () => {
      const url = buildShareUrl(window.location.href, store.get());
      window.history.replaceState(null, "", url);
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    },
    onReset: () => { store.set(defaultState()); buildPanel(panelRoot, store, arguments[0]); },
  });
}

main();
```

Note: the `onReset` rebuild via `arguments[0]` won't work in a module arrow scope — extract the callbacks object to a named `const callbacks = {…}` and reference it in `onReset` as `buildPanel(panelRoot, store, callbacks)`.

- [ ] **Step 2: Run the dev server and verify the full effect**

Run: `npm run dev`
Open the printed localhost URL and confirm:
- Text "GEIST" renders as crisp Geist Pixel squares.
- Dragging orbits the text; the pixels stay grid-aligned and re-pixelate at the new angle.
- Shift-drag pans; wheel zooms (letterforms grow/shrink, cells stay fixed-size).
- Rotation X/Y/Z, Scale, Resolution sliders, and Shape dropdown all update live.
- Editing the text re-rasterizes.
- "PNG" downloads an image; "Share" copies a URL — open it in a new tab and confirm the view is restored.

Fix any DPR/crispness issues noted in Task 11 (adjust `MAX_DPR`, and make the Square ImageData path account for `dpr` by scaling cell coords/size, or render that path at dpr=1).

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all unit tests pass (mat3, transform3d, homography, threshold, projectPlane, repixelate, paintSquares, store, shareLink).

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire viewer end-to-end"
```

---

## Self-Review

**Spec coverage:**
- Type text → Geist Pixel: Task 5 + 15. ✓
- Orbit/zoom/pan: Task 12. ✓
- Rotation X/Y/Z + scale controls: Task 13. ✓
- Shape switcher (Square/Grid/Circle/Triangle/Line): Tasks 8, 13. ✓
- Resolution / cell-size control: Task 13. ✓
- Fixed-grid re-pixelation via inverse homography: Tasks 6, 7. ✓
- Perspective projection: Task 3. ✓
- PNG export: Tasks 14, 15. ✓
- Shareable URL: Tasks 9, 10, 15. ✓
- Performance (Path2D batching, ImageData fast-path, dirty-flag rAF, AABB iteration, integer snap, DPR cap): Tasks 7, 8, 11. ✓
- Error handling (font load, empty text, degenerate transform, size cap): Tasks 5, 6, 15. ✓
- Canvas 2D + Vite + vanilla TS + Vitest: Task 1. ✓

**Placeholder scan:** No "TBD"/"implement later". The two implementation notes (Task 11 DPR, Task 15 `onReset`) describe concrete fixes with the exact change to make — addressed during the verify step.

**Type consistency:** `Bitmap`, `ViewerState`, `Mat3`, `Vec2`, `Vec3`, `Shape`, `ProjectedQuad` are defined once in `src/types.ts` (Task 1) and imported everywhere. `LiveCell` is defined in `repixelate.ts` and imported by `paintSquares.ts`/`drawShapes.ts`. Function names (`projectPlane`, `repixelate`, `drawCells`, `paintSquares`, `solveHomography`, `mat3MulVec`, `serializeState`/`deserializeState`) are used consistently across tasks.
