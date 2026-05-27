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
}

export interface ProjectedQuad {
  corners: [Vec2, Vec2, Vec2, Vec2]; // TL, TR, BR, BL in screen px
  homography: Mat3;                  // source(u,v) -> screen(x,y)
  inverse: Mat3;                     // screen(x,y) -> source(u,v)
  valid: boolean;
}
