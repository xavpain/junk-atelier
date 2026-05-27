# Geist Pixel 3D Viewer — Design

**Date:** 2026-05-27
**Status:** Approved (design); pending spec review

## Summary

A single-page web app that displays text in Vercel's **Geist Pixel** bitmap typeface and lets
the user orbit, zoom, and pan it as if it were 3D — but with **no 3D renderer**. The screen is a
fixed grid of pixel cells. Each frame, the text (a flat plane in 3D space) is projected to the
screen and **re-sampled onto that fixed grid**, so the output is always crisp, screen-aligned
Geist Pixel cells showing the perspective-warped letterforms. The pixels stay sharp and
grid-locked at every angle — "a 2D pixel display of 3D text."

## Goals

- Type arbitrary text and see it rendered in Geist Pixel.
- Orbit (drag), zoom (wheel), and pan (shift-drag) like a 3D viewer.
- Explicit transform controls: rotation X/Y/Z, scale.
- Switch the rendered pixel shape (Square / Grid / Circle / Triangle / Line).
- Adjustable pixel resolution (cell size).
- Export the current view to PNG.
- Share a link that restores the exact view.
- Hold a smooth ~60fps during interaction.

## Non-goals (v1)

- No extruded / volumetric 3D text (flat plane only).
- No per-letter depth layering.
- No real 3D engine (Three.js/WebGL) — Canvas 2D only.
- No multi-line rich text layout beyond what the font naturally provides.
- No server/back-end, accounts, or persistence beyond the URL hash.

## Core visual model (the defining decision)

The pixels form a **fixed-size screen grid**, as if the text lives on a fixed-resolution pixel
monitor. Zooming makes the **letterforms span more or fewer cells**; the cells themselves never
change size. A resolution / cell-size control lets the user go chunky or fine.

This is deliberately chosen over the alternative (drawing each source pixel as a depth-scaled
billboard quad that grows/shrinks with distance), which would give an "object-made-of-cubes"
feel but break the fixed-display aesthetic.

## Rendering pipeline (per frame)

1. **Rasterize text** — render the input string in Geist Pixel **Square** variant to an
   offscreen canvas at a known scale, read `ImageData`, and threshold alpha to a logical on/off
   bitmap grid `Bitmap { cols, rows, data: Uint8Array }`. Square is used because it gives the
   densest, cleanest letterforms; the *visual* shape is drawn by us in step 5, so only the
   Square variant font file is required. (Re-run only when the text changes, not every frame.)
2. **Place as a flat plane** — map each bitmap cell center to plane coordinates centered at the
   origin, lying in the z = 0 plane.
3. **Transform** — compose object rotation (sliders) + object scale with camera orbit (drag) +
   zoom (wheel) + pan (shift-drag). Because the source is a flat quad, the entire model →
   camera → perspective projection reduces to a single **homography** derived from the four
   projected corner correspondences.
4. **Re-pixelate** — for each cell of the fixed screen grid (within the projected quad's screen
   AABB), inverse-map its center through the homography into source space and sample the bitmap
   with nearest-neighbor. "On" → live cell. Inverse-mapping (screen → source) is used rather
   than forward point-splatting to avoid gaps and overlaps.
5. **Draw** — render each live cell as the selected shape at the fixed cell size (see
   Performance for batching).

### Math notes

- Rotation: standard `Rz · Ry · Rx` matrices; combine object rotation and orbit rotation.
- Perspective: camera at distance `d` on +z looking at origin; project
  `(X, Y, Z) → f · (X, Y) / (d − Z)` with FOV-derived focal length `f`.
- Homography: solve the 3×3 mapping from the 4 source-plane corners to their 4 projected screen
  corners; invert the 3×3 for the per-cell inverse map. Both computed once per frame.

## Interaction

- **Drag** → orbit (yaw/pitch).
- **Shift-drag** → pan (translate the view).
- **Wheel** → zoom.
- **Control panel:** text input; rotation X/Y/Z sliders; scale slider; resolution (cell-size)
  slider; shape dropdown (Square/Grid/Circle/Triangle/Line); perspective FOV; reset; export PNG;
  copy share-link.

## State, sharing, export

- A central **store** holds all parameters: `{ text, objRotation {x,y,z}, scale, orbit {yaw,pitch},
  pan {x,y}, zoom, fov, shape, cellSize }`. Canvas and panel both subscribe and react.
- **Share** — serialize the store to a base64-encoded JSON string in the URL hash; on load,
  parse and restore. Round-trip must be lossless.
- **Export** — `canvas.toBlob(...)` → PNG download of the current view.

## Performance (first-class requirement)

Target: smooth ~60fps during interaction; ~0% CPU when idle.

- **Cost model:** the per-cell inverse-map is a cheap 3×3 multiply + divide + array lookup
  (~32k cells at 1080p/8px is < 1 ms). The homography and its inverse are computed **once per
  frame**. The real cost is draw calls, so:
- **Batch draws into one Path2D per shape** (rect/arc/triangle/lines added to a single path,
  then one `fill()`/`stroke()`).
- **ImageData fast-path for Square** — write RGBA bytes directly into an `ImageData` buffer and
  `putImageData` once. Fastest, and intentionally non-anti-aliased (crisp).
- **On-demand rendering** — dirty flag + `requestAnimationFrame`; render only when state
  changes; coalesce input events into one render per frame.
- **Iterate only the projected quad's screen AABB**, not the whole canvas.
- **Snap to integer pixel coordinates** to avoid subpixel AA and preserve crispness.
- **Cap devicePixelRatio** (e.g. at 2) to bound retina cost.
- **Interactive LOD (optional)** — coarsen cell size during a drag gesture, refine on settle;
  only needed at very fine resolutions.

The fixed-grid model bounds the cell count regardless of zoom, which keeps the worst case well
inside the 16.6 ms frame budget.

## Error handling

- **Font load failure** — show a message and offer retry; do not attempt to rasterize.
- **Empty text** — render a blank canvas, no error.
- **Degenerate transforms** — guard against divide-by-zero when the plane is edge-on or behind
  the camera (clamp denominators / skip drawing that frame).
- **Very long text** — cap the bitmap grid size to protect memory and frame time.

## Tech stack & module structure

- **Vite + vanilla TypeScript** (no UI framework) — lean and consistent with the hand-rolled,
  "it's all 2D" ethos.
- **Modules**, each with one responsibility:
  - `font/rasterizeText.ts` — load Geist Pixel Square, render text, threshold → `Bitmap`.
  - `math/` — vector/matrix helpers: rotation matrices, perspective projection, homography
    solve, 3×3 inverse.
  - `render/projectPlane.ts` — given bitmap + transform state + viewport, compute projected quad
    corners and the source↔screen homography.
  - `render/repixelate.ts` — given the inverse homography + bitmap + screen grid params, produce
    the list of live screen cells.
  - `render/drawShapes.ts` — draw live cells in the selected shape (Path2D batching; ImageData
    fast-path for Square).
  - `render/renderer.ts` — frame orchestration; dirty flag + rAF loop.
  - `interaction/controls.ts` — drag → orbit, shift-drag → pan, wheel → zoom; updates store.
  - `state/store.ts` — central state + subscribe; URL-hash serialize/deserialize.
  - `ui/panel.ts` — build control-panel DOM, bind to store.
  - `export/exportPng.ts`, `share/shareLink.ts`.
  - `main.ts` — wire everything together.

## Testing

- **Pure, unit-tested with Vitest (TDD):** rotation matrices, perspective projection, homography
  solve + inverse, re-pixelate sampling correctness, URL serialize/deserialize round-trip,
  bitmap thresholding from a known canvas fixture.
- Rendering and interaction modules are kept thin and delegate to the pure core.

## Open questions / future ideas

- Per-letter depth layering or extrusion as a later mode.
- Color / theming controls.
- Animation (auto-rotate, recording to GIF/video).
- Multi-line / paragraph layout controls.
