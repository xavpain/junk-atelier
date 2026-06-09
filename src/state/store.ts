import type { Scene, Pane, Camera, Background, AspectKey } from "../types";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `p${idCounter}`;
}

export function defaultPane(id = nextId(), text = "JUNK"): Pane {
  return {
    id,
    source: "text",
    text,
    font: "Geist Pixel Square",
    mediaName: "",
    shape: "square",
    thickness: 0,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    skew: { x: 0, y: 0 },
    cellSize: 8,
    colorMode: "solid",
    color: "#000000",
    color2: "#5a9bd4",
    alpha: 1,
    outline: false,
    outlineColor: "#5a9bd4",
    outlineWidth: 1,
    card: false,
    cardColor: "#141420",
    cardAlpha: 0.85,
    animate: false,
    animMode: "credits",
    animDir: 1,
    animSpeed: 60,
    floatEnabled: false,
    floatAxis: "z",
    floatAmp: 2,
    floatSpeed: 0.4,
    swayEnabled: false,
    swayAxis: "y",
    swayAmp: 0.2,
    swaySpeed: 0.3,
  };
}

export function defaultCamera(): Camera {
  return { orbit: { yaw: 0, pitch: 0 }, pan: { x: 0, y: 0 }, zoom: 1, fov: Math.PI / 3 };
}

export function defaultBackground(): Background {
  return {
    style: "solid",
    color: "#ffffff",
    transparent: false,
    accent: "#d8d8e0",
    spacing: 16,
    dotRadius: 1,
    fade: false,
    fadeColor: "#101018",
    fadeSpeed: 0.2,
  };
}

export function defaultScene(): Scene {
  const pane = defaultPane();
  return { panes: [pane], selectedId: pane.id, camera: defaultCamera(), background: defaultBackground(), aspect: "free" };
}

// A pre-built scene shown when a first-time visitor picks "Load demo" — meant to
// show off layered panes, rotation, gradient + a tinted background at a glance.
export function demoScene(): Scene {
  const back: Pane = {
    ...defaultPane(nextId(), "JUNK"),
    position: { x: -1.5, y: 1, z: -3 }, rotation: { x: 0, y: 0.5, z: 0.06 },
    scale: 2.2, cellSize: 6, colorMode: "gradient", color: "#ff5b8a", color2: "#7e14ff",
    outline: true, outlineColor: "#101018", outlineWidth: 2,
  };
  // Circle shape shows off Geist Pixel's glyph silhouette as dots.
  const front: Pane = {
    ...defaultPane(nextId(), "ATELIER"),
    position: { x: 1.2, y: -1.4, z: 1.5 }, rotation: { x: -0.1, y: -0.4, z: -0.04 },
    scale: 1.1, cellSize: 4, color: "#101018", shape: "circle",
    card: true, cardColor: "#47bfff", cardAlpha: 0.9,
    swayEnabled: true, swayAxis: "y", swayAmp: 0.18, swaySpeed: 0.25,
  };
  // Slow marquee strip — demos the scroll animation + the "grid" shape.
  const marquee: Pane = {
    ...defaultPane(nextId(), "★ try it out brodie ★ "),
    position: { x: 0, y: -3.6, z: 0.4 }, rotation: { x: 0.12, y: 0, z: 0 },
    scale: 0.9, cellSize: 3, color: "#7e14ff", shape: "grid", skew: { x: 0, y: -0.2 },
    animate: true, animMode: "marquee", animDir: -1, animSpeed: 16,
  };
  const bg: Background = {
    ...defaultBackground(), style: "dotted", color: "#fef6e4", accent: "#ffb84d",
    spacing: 22, dotRadius: 2,
  };
  return {
    panes: [back, front, marquee], selectedId: front.id,
    camera: { ...defaultCamera(), orbit: { yaw: -0.25, pitch: 0.12 } },
    background: bg, aspect: "free",
  };
}

// ---- Pure reducers (use via store.update) ----

export function getSelected(scene: Scene): Pane {
  return scene.panes.find((p) => p.id === scene.selectedId) ?? scene.panes[0];
}

export function selectPane(scene: Scene, id: string): Scene {
  return scene.panes.some((p) => p.id === id) ? { ...scene, selectedId: id } : scene;
}

export function addPane(scene: Scene): Scene {
  const pane = defaultPane(nextId(), "TEXT");
  return { ...scene, panes: [...scene.panes, pane], selectedId: pane.id };
}

export function duplicatePane(scene: Scene): Scene {
  const sel = getSelected(scene);
  const copy: Pane = {
    ...sel,
    id: nextId(),
    position: { ...sel.position, x: sel.position.x + 1 }, // nudge so it's visible
    rotation: { ...sel.rotation },
    skew: { ...sel.skew },
  };
  const i = scene.panes.findIndex((p) => p.id === sel.id);
  const panes = [...scene.panes.slice(0, i + 1), copy, ...scene.panes.slice(i + 1)];
  return { ...scene, panes, selectedId: copy.id };
}

export function deletePane(scene: Scene): Scene {
  if (scene.panes.length <= 1) return scene; // keep at least one
  const i = scene.panes.findIndex((p) => p.id === scene.selectedId);
  const panes = scene.panes.filter((p) => p.id !== scene.selectedId);
  const selectedId = panes[Math.min(i, panes.length - 1)].id;
  return { ...scene, panes, selectedId };
}

export function updateSelected(scene: Scene, patch: Partial<Pane>): Scene {
  return {
    ...scene,
    panes: scene.panes.map((p) => (p.id === scene.selectedId ? { ...p, ...patch } : p)),
  };
}

// ---- Store ----

export interface Store {
  get(): Scene;
  set(patch: Partial<Scene>): void;
  update(fn: (s: Scene) => Scene): void;
  subscribe(fn: (s: Scene) => void): () => void;
}

export function createStore(initial: Scene): Store {
  let state = initial;
  const subs = new Set<(s: Scene) => void>();
  const emit = () => { for (const fn of subs) fn(state); };
  return {
    get: () => state,
    set(patch) { state = { ...state, ...patch }; emit(); },
    update(fn) { state = fn(state); emit(); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

export function serializeScene(scene: Scene): string {
  return btoa(encodeURIComponent(JSON.stringify(scene)));
}

export function deserializeScene(encoded: string): Scene {
  const obj = JSON.parse(decodeURIComponent(atob(encoded)));
  return migrateScene(obj);
}

// Accepts a current Scene or a V1 flat ViewerState and returns a valid Scene.
export function migrateScene(obj: unknown): Scene {
  const o = obj as Record<string, unknown>;
  if (o && Array.isArray(o.panes)) {
    // Fill any fields added since the link was made.
    const panes = (o.panes as Pane[]).map((p) => ({ ...defaultPane(p.id), ...p }));
    return {
      panes,
      selectedId: (o.selectedId as string) ?? panes[0]?.id,
      camera: { ...defaultCamera(), ...(o.camera as Camera) },
      background: { ...defaultBackground(), ...(o.background as Background) },
      aspect: (o.aspect as AspectKey) ?? "free",
    };
  }
  // V1 ViewerState -> one-pane Scene.
  if (o && typeof o.text === "string") {
    const pane = defaultPane(nextId(), o.text as string);
    pane.shape = (o.shape as Pane["shape"]) ?? pane.shape;
    pane.thickness = (o.thickness as number) ?? pane.thickness;
    pane.scale = (o.scale as number) ?? pane.scale;
    pane.cellSize = (o.cellSize as number) ?? pane.cellSize;
    if (o.objRotation) pane.rotation = o.objRotation as Pane["rotation"];
    if (typeof o.animate === "boolean") pane.animate = o.animate as boolean;
    if (o.animMode) pane.animMode = o.animMode as Pane["animMode"];
    if (typeof o.animSpeed === "number") pane.animSpeed = o.animSpeed as number;
    const camera = defaultCamera();
    if (o.orbit) camera.orbit = o.orbit as Camera["orbit"];
    if (o.pan) camera.pan = o.pan as Camera["pan"];
    if (typeof o.zoom === "number") camera.zoom = o.zoom as number;
    if (typeof o.fov === "number") camera.fov = o.fov as number;
    const background = defaultBackground();
    if (typeof o.background === "string") background.color = o.background as string;
    if (typeof o.transparent === "boolean") background.transparent = o.transparent as boolean;
    return { panes: [pane], selectedId: pane.id, camera, background, aspect: "free" };
  }
  return defaultScene();
}
