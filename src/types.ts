export interface Vec2 { x: number; y: number; }
export interface Vec3 { x: number; y: number; z: number; }

// Row-major 3x3 matrix, length 9.
export type Mat3 = number[];

export type Shape = "square" | "grid" | "circle" | "triangle" | "line";
export type AnimMode = "credits" | "marquee";
export type AnimDir = 1 | -1;
export type ColorMode = "solid" | "gradient";
export type BgStyle = "solid" | "grid" | "dotted";
export type Axis = "x" | "y" | "z";
export type PaneSource = "text" | "media";
export type AspectKey = "free" | "16:9" | "9:16" | "1:1" | "4:5" | "4:3";

export interface Bitmap {
  cols: number;
  rows: number;
  data: Uint8Array; // row-major, 1 = on, 0 = off, length cols*rows
}

// Sampled colour grid for media panes (image/video/gif).
export interface ColorBitmap {
  cols: number;
  rows: number;
  data: Uint8ClampedArray; // row-major RGBA, length cols*rows*4
  dynamic: boolean;        // true for video/gif -> resample every frame
}

// One text plane in the scene. All content/transform/colour settings are per-pane.
export interface Pane {
  id: string;
  source: PaneSource;    // text glyphs or imported media
  text: string;          // may be multiline (stacked bitmap)
  font: string;          // font-family for text source
  mediaName: string;     // label of imported media (object URL lives in runtime registry)
  mediaId: string;       // content hash of imported media; keys the local IndexedDB
                         // blob cache so the maker's own browser can restore it.
                         // "" when no media. The blob itself never leaves the device.
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
  // Decorative border stroked around the pane's projected quad (independent of
  // selection — purely a style choice).
  outline: boolean;
  outlineColor: string;  // hex
  outlineWidth: number;  // screen px
  // Card backing: a filled quad behind the cells so the pane reads as a surface
  // that occludes the background (dots/grid sit behind it).
  card: boolean;
  cardColor: string;
  cardAlpha: number;
  // Text scroll.
  animate: boolean;
  animMode: AnimMode;
  animDir: AnimDir;
  animSpeed: number;     // source px / second
  // Float: sinusoidal position oscillation (wobble / floating).
  floatEnabled: boolean;
  floatAxis: Axis;
  floatAmp: number;      // world units
  floatSpeed: number;    // cycles / second
  // Sway: sinusoidal rotation oscillation.
  swayEnabled: boolean;
  swayAxis: Axis;
  swayAmp: number;       // radians
  swaySpeed: number;     // cycles / second
}

// Global camera shared by the whole scene.
export interface Camera {
  orbit: { yaw: number; pitch: number };
  pan: Vec2;
  zoom: number;
  fov: number;
}

// Global 2D background, locked to the screen (never transformed by the camera).
export interface Background {
  style: BgStyle;
  color: string;         // base fill
  transparent: boolean;  // solid only; PNG keeps alpha
  accent: string;        // grid line / dot color
  spacing: number;       // px between grid lines / dots
  dotRadius: number;     // dot radius (dotted style)
  fade: boolean;         // animated color drift
  fadeColor: string;     // 2nd color the fade drifts toward
  fadeSpeed: number;     // fade cycles / second
}

export interface Scene {
  panes: Pane[];
  selectedId: string;
  camera: Camera;
  background: Background;
  aspect: AspectKey;     // canvas/stage aspect ratio (free = fill window)
}

export interface ProjectedQuad {
  corners: [Vec2, Vec2, Vec2, Vec2]; // TL, TR, BR, BL in screen px
  homography: Mat3;                  // source(u,v) -> screen(x,y)
  inverse: Mat3;                     // screen(x,y) -> source(u,v)
  meanDepth: number;                 // mean camera-space depth (for painter sort)
  valid: boolean;
}
