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
