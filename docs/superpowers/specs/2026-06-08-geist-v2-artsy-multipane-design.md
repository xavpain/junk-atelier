# Geist Pixel Viewer — V2: Artsy Multi-Pane Design

Date: 2026-06-08
Branch: feat/geist-pixel-3d-viewer (V2 work)

## Vision

Turn the single-plane pixel-text viewer into an artsy composition tool: a dream
between 2D and 3D where **everything you see is flat pixel art**, but multiple
text "panes" float in a shared 3D space at different orientations. A 2D
**background/canvas** stays locked to the screen; as you orbit/zoom the camera,
the panes peel away from that flat backdrop, revealing the distinction between
"text floating in space" and "canvas behind." All content settings are
**per-pane**; camera and background are **global**.

Key decisions (from brainstorming):
- Background model **A**: screen-fixed 2D layer; orbit moves only the panes.
- Positioning model **C** (hybrid): click-to-select in viewport + sliders to
  position now; drag-in-viewport deferred.
- Per-pane = all content/transform/color/animation. Global = camera + background.
- Background styles: solid, grid, dotted, + animated fade modifier.
- Pane color: per-pane color **and** opacity (overlapping panes blend/ghost),
  plus optional gradient (`colorMode`).
- Added per-pane: skew (shear), animation direction, gradient text coloring.

## Approach

Extend the existing 2D pixel pipeline (`projectPlane → repixelate → cell fill`)
to N panes via painter's algorithm. Reuses all existing math. No WebGL. The
"all 2D" aesthetic is preserved because it is literally the same flat-cell
renderer applied to multiple planes. Cost: drop the `putImageData` square
fast-path (alpha compositing needs `fillStyle` rgba per cell).

## Data Model (`src/types.ts`)

```ts
export type Shape = "square" | "grid" | "circle" | "triangle" | "line";
export type AnimMode = "credits" | "marquee";
export type AnimDir = 1 | -1;
export type ColorMode = "solid" | "gradient";

export interface Pane {
  id: string;
  text: string;          // may be multiline (stacked bitmap)
  shape: Shape;
  thickness: number;     // morphological passes (>0 dilate, <0 erode)
  position: Vec3;        // world units; translate after obj-rotate, before orbit
  rotation: Vec3;        // object rotation x,y,z
  scale: number;
  skew: Vec2;            // skewX, skewY (shear of source plane, pre-rotation)
  cellSize: number;      // per-pane pixel resolution
  colorMode: ColorMode;
  color: string;         // hex (solid, or gradient start)
  color2: string;        // hex (gradient end)
  alpha: number;         // 0..1
  animate: boolean;
  animMode: AnimMode;    // credits = vertical, marquee = horizontal
  animDir: AnimDir;      // scroll direction sign
  animSpeed: number;     // source px / second
}

export interface Camera {
  orbit: { yaw: number; pitch: number };
  pan: Vec2;
  zoom: number;
  fov: number;
}

export interface Background {
  style: "solid" | "grid" | "dotted";
  color: string;         // base fill
  transparent: boolean;  // solid only; PNG keeps alpha
  accent: string;        // grid line / dot color
  spacing: number;       // px between grid lines / dots
  fade: boolean;         // animated color drift
  fadeColor: string;     // 2nd color the fade drifts toward
}

export interface Scene {
  panes: Pane[];
  selectedId: string;
  camera: Camera;
  background: Background;
}
```

- Each pane owns a cached `Bitmap`, recomputed only when its `text`/`thickness`
  change (keyed by pane id).
- `defaultScene()` returns one pane with V1 defaults + default camera + solid
  background, so V2 opens looking like V1.

## Rendering (`src/render/`)

Per frame (`requestAnimationFrame(ts)`):

1. **Clear** canvas.
2. **Background** — `drawBackground(ctx, bg, vp, ts)` (screen-space, never
   transformed):
   - `solid`: fillRect base (skip if transparent).
   - `grid`: base + 1px lines every `spacing` in `accent`.
   - `dotted`: base + dots every `spacing` in `accent`.
   - `fade` modifier: base color = lerp(`color`,`fadeColor`,(sin(ts·k)+1)/2).
3. **Project panes** — `projectPlane(bitmap, pane, camera, viewport)` returns
   `{ ...ProjectedQuad, meanDepth }`. Transform order:
   bitmap→centered-world(×scale) → **skew** → rotateXYZ(rotation) →
   **translate(position)** → orbit(pitch,yaw) → perspective.
   `meanDepth` = mean camera-space depth of the 4 corners.
4. **Sort** panes far→near by `meanDepth` (painter's, for correct alpha blend).
5. **Draw cells** — per pane: `repixelate(bitmap, quad, vp, cellSize, scroll?)`
   → one `Path2D` (square=rect, others as V1) → fill with solid rgba
   (`color`,`alpha`) or a `createLinearGradient` across the quad bbox
   (`color`→`color2`) when `colorMode==="gradient"`.
6. **Selection outline** — stroke the selected pane's quad border (accent).

Continuous redraw forced when any pane animates **or** `background.fade`.
Per-pane scroll offset accumulates in a `Map<id, scrollPx>`; offset =
`animSpeed * animDir`; mapped to `{du,dv}` by `animMode`.

## Interaction (`src/interaction/`)

- **Camera (global)**: `attachControls` writes `scene.camera`. Same feel.
- **Click vs drag**: mousedown→mouseup with movement under a px threshold =
  select click; beyond threshold = camera orbit/pan.
- **Select**: on select-click, hit-test panes near→far via each quad `inverse`
  homography; hit if `(u,v)` in `[0,cols]×[0,rows]`. First hit → `selectedId`.
  Empty space keeps current selection. (`render/hitTest.ts`.)
- **Edit**: panel sliders write the selected pane.
- **Pane list**: add / duplicate(selected) / delete / click-select rows, synced
  with viewport selection.

## Panel UI (`src/ui/panel.ts`)

- **PANES**: list rows (selected highlighted) + Add / Duplicate / Delete.
- **SELECTED PANE**: text (textarea), shape, thickness, posX/Y/Z, rotX/Y/Z,
  scale, skewX/Y, colorMode, color, color2, alpha, resolution (cellSize),
  animate, animMode, animDir, animSpeed.
- **GLOBAL**: background style + color + accent + spacing + transparent + fade +
  fadeColor; camera FOV; Reset / Share / PNG / Record (+ clip length).
- Rebuilds on selection change; slider input live-writes the selected pane.

## Export / Share

- PNG (`exportPng`) and WebM (`exportWebm`) unchanged — they capture the whole
  composited canvas.
- Share (`share/shareLink.ts`): serialize the `Scene`. Migration shim: if a
  decoded link has top-level `text` and no `panes`, wrap it into a one-pane
  Scene (V1 → V2 compatibility).

## Files

- `types.ts` — Pane/Camera/Background/Scene + enums.
- `state/store.ts` — Scene store + reducers: addPane, duplicatePane, deletePane,
  selectPane, updatePane(patch), setCamera, setBackground; `defaultScene()`.
- `math/transform3d.ts` — add `translate(p,v)` and `shear` helper. (+tests)
- `render/projectPlane.ts` — split model/camera, apply skew+translate, return
  meanDepth. (tests updated)
- `render/repixelate.ts` — unchanged (scroll already supports du/dv).
- `render/drawShapes.ts` — `drawPaneCells` rgba solid/gradient; drop putImageData.
- `render/background.ts` — NEW `drawBackground`.
- `render/hitTest.ts` — NEW point-in-pane via inverse homography. (+tests)
- `render/renderer.ts` — scene loop: bg → project → depth-sort → draw → outline;
  per-pane scroll clock; continuous redraw when animate||fade.
- `interaction/controls.ts` — write camera; click-vs-drag → `onSelectAt(point)`.
- `ui/panel.ts` — rebuilt panel.
- `share/shareLink.ts` — Scene serialize + V1 migration shim. (+tests)
- `main.ts` — wire scene store, per-pane rasterize cache, selection, panel.

## Testing

- transform3d: translate + skew unit tests.
- projectPlane: depth + skew behavior (update existing test).
- depth-sort: ordering test.
- hitTest: inside/outside quad.
- store reducers: add/duplicate/delete/select/update.
- shareLink: round-trip + V1→V2 migration.
- Retained: morph, repixelate, homography, mat3, paintSquares (or removed if
  putImageData path dropped — keep paintSquares module unused or delete).

## Risks / Notes

- Old V1 share links handled by migration shim.
- Perf: N panes × repixelate per animated frame; fine for a handful of panes.
- `paintSquares` fast-path becomes unused once alpha compositing lands; remove
  it and its test, or keep behind a single-opaque-pane optimization later.
```
