import type { Bitmap, ProjectedQuad, Pane, Camera, Vec2, Vec3 } from "../types";
import { rotateX, rotateY, rotateZ, translate, shear, perspectiveProject, WORLD_SIZE } from "../math/transform3d";
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
  const projParams = {
    fov: camera.fov, zoom: camera.zoom, pan: camera.pan,
    width: viewport.width, height: viewport.height,
  };

  const screenCorners: Vec2[] = [];
  let depthSum = 0;
  for (const c of srcCorners) {
    // Bitmap space -> centered world (flip y so +y is up).
    let p: Vec3 = {
      x: (c.x - cols / 2) * unitsPerCell * pane.scale,
      y: (rows / 2 - c.y) * unitsPerCell * pane.scale,
      z: 0,
    };
    p = shear(p, pane.skew.x, pane.skew.y);
    p = rotateZ(rotateY(rotateX(p, pane.rotation.x), pane.rotation.y), pane.rotation.z);
    p = translate(p, pane.position);
    p = rotateX(p, camera.orbit.pitch);
    p = rotateY(p, camera.orbit.yaw);

    const { screen, depth } = perspectiveProject(p, projParams);
    if (depth <= 0.01) return EMPTY; // plane crosses/behind camera
    depthSum += depth;
    screenCorners.push(screen);
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
