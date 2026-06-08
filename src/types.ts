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
  objRotation: Vec3;
  scale: number;
  orbit: { yaw: number; pitch: number };
  pan: Vec2;
  zoom: number;
  fov: number;
  shape: Shape;
  cellSize: number;
  background: string;   // CSS color used when transparent is false
  transparent: boolean; // true = clear canvas (no fill), PNG keeps alpha
  thickness: number;    // morphological passes: >0 dilate (bolder), <0 erode (thinner)
  animate: boolean;     // scroll the text content through the plane
  animMode: AnimMode;   // credits = vertical scroll, marquee = horizontal
  animSpeed: number;    // source px per second
}

export type AnimMode = "credits" | "marquee";

export interface ProjectedQuad {
  corners: [Vec2, Vec2, Vec2, Vec2]; // TL, TR, BR, BL in screen px
  homography: Mat3;                  // source(u,v) -> screen(x,y)
  inverse: Mat3;                     // screen(x,y) -> source(u,v)
  valid: boolean;
}
