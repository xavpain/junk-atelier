import type { Bitmap, ProjectedQuad, Pane, Camera, Vec2 } from "../types";
import { WORLD_SIZE, CAMERA_DISTANCE } from "../math/transform3d";
import { solveHomography } from "../math/homography";
import { mat3Inverse } from "../math/mat3";

const EMPTY: ProjectedQuad = {
  corners: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
  homography: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  meanDepth: Infinity,
  valid: false,
};

// Projects a pane's source bitmap onto a screen-space quad through the global
// camera. Transform order: bitmap -> centred world (xscale) -> skew -> rotateXYZ
// -> translate(position) -> camera orbit -> perspective.
export function projectPlane(
  bitmap: Bitmap,
  pane: Pane,
  camera: Camera,
  viewport: { width: number; height: number },
): ProjectedQuad {
  const { cols, rows } = bitmap;
  if (cols === 0 || rows === 0) return EMPTY;

  // Source corners in bitmap pixel space: TL, TR, BR, BL.
  const srcCorners: [Vec2, Vec2, Vec2, Vec2] = [
    { x: 0, y: 0 }, { x: cols, y: 0 }, { x: cols, y: rows }, { x: 0, y: rows },
  ];

  const unitsPerCell = WORLD_SIZE / Math.max(cols, rows);

  // All four corners share the pane + camera transform, so the trig is hoisted
  // out of the corner loop and the chain (shear -> rotateXYZ -> translate ->
  // orbit -> perspective) is applied as scalar math — no per-corner Vec3
  // allocations or repeated cos/sin (this runs per pane per paint).
  const crx = Math.cos(pane.rotation.x), srx = Math.sin(pane.rotation.x);
  const cry = Math.cos(pane.rotation.y), sry = Math.sin(pane.rotation.y);
  const crz = Math.cos(pane.rotation.z), srz = Math.sin(pane.rotation.z);
  const cp = Math.cos(camera.orbit.pitch), sp = Math.sin(camera.orbit.pitch);
  const cy = Math.cos(camera.orbit.yaw), sy = Math.sin(camera.orbit.yaw);
  const kx = pane.skew.x, ky = pane.skew.y;
  const f = ((viewport.height / 2) / Math.tan(camera.fov / 2)) * camera.zoom;
  const halfW = viewport.width / 2 + camera.pan.x;
  const halfH = viewport.height / 2 + camera.pan.y;

  const screenCorners: Vec2[] = [];
  let depthSum = 0;
  for (const c of srcCorners) {
    // Bitmap space -> centered world (flip y so +y is up).
    const wx = (c.x - cols / 2) * unitsPerCell * pane.scale;
    const wy = (rows / 2 - c.y) * unitsPerCell * pane.scale;
    // shear (z stays 0)
    let x = wx + kx * wy;
    let y = wy + ky * wx;
    let z = 0;
    // rotateX
    let t = y * crx - z * srx; z = y * srx + z * crx; y = t;
    // rotateY
    t = x * cry + z * sry; z = -x * sry + z * cry; x = t;
    // rotateZ
    t = x * crz - y * srz; y = x * srz + y * crz; x = t;
    // translate
    x += pane.position.x; y += pane.position.y; z += pane.position.z;
    // camera orbit: rotateX(pitch) then rotateY(yaw)
    t = y * cp - z * sp; z = y * sp + z * cp; y = t;
    t = x * cy + z * sy; z = -x * sy + z * cy; x = t;

    const depth = CAMERA_DISTANCE - z;
    if (depth <= 0.01) return EMPTY; // plane crosses/behind camera
    depthSum += depth;
    screenCorners.push({ x: halfW + (f * x) / depth, y: halfH - (f * y) / depth });
  }

  const corners = screenCorners as [Vec2, Vec2, Vec2, Vec2];
  let homography, inverse;
  try {
    homography = solveHomography(srcCorners, corners);
    inverse = mat3Inverse(homography);
  } catch {
    return EMPTY; // degenerate (edge-on collapse)
  }
  return { corners, homography, inverse, meanDepth: depthSum / 4, valid: true };
}
