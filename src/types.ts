export interface Vec2 { x: number; y: number; }
export interface Vec3 { x: number; y: number; z: number; }

// Row-major 3x3 matrix, length 9.
export type Mat3 = number[];

export type Shape = "square" | "grid" | "circle" | "triangle" | "line";
export type AnimMode = "credits" | "marquee";
export type AnimDir = 1 | -1;
export type ColorMode = "solid" | "gradient";
export type BgStyle = "solid" | "grid" | "dotted";

export interface Bitmap {
  cols: number;
  rows: number;
  data: Uint8Array; // row-major, 1 = on, 0 = off, length cols*rows
}

// One text plane in the scene. All content/transform/colour settings are per-pane.
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
  animMode: AnimMode;
  animDir: AnimDir;
  animSpeed: number;     // source px / second
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
  fade: boolean;         // animated color drift
  fadeColor: string;     // 2nd color the fade drifts toward
}

export interface Scene {
  panes: Pane[];
  selectedId: string;
  camera: Camera;
  background: Background;
}

export interface ProjectedQuad {
  corners: [Vec2, Vec2, Vec2, Vec2]; // TL, TR, BR, BL in screen px
  homography: Mat3;                  // source(u,v) -> screen(x,y)
  inverse: Mat3;                     // screen(x,y) -> source(u,v)
  meanDepth: number;                 // mean camera-space depth (for painter sort)
  valid: boolean;
}
