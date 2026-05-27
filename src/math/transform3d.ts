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
