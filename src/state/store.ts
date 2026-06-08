import type { ViewerState } from "../types";

export function defaultState(): ViewerState {
  return {
    text: "GEIST",
    objRotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    orbit: { yaw: 0, pitch: 0 },
    pan: { x: 0, y: 0 },
    zoom: 1,
    fov: Math.PI / 3,
    shape: "square",
    cellSize: 8,
    background: "#0a0a0a",
    transparent: true,
    thickness: 0,
    animate: false,
    animMode: "credits",
    animSpeed: 60,
  };
}

export interface Store {
  get(): ViewerState;
  set(patch: Partial<ViewerState>): void;
  subscribe(fn: (s: ViewerState) => void): () => void;
}

export function createStore(initial: ViewerState): Store {
  let state = initial;
  const subs = new Set<(s: ViewerState) => void>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of subs) fn(state);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function serializeState(state: ViewerState): string {
  return btoa(encodeURIComponent(JSON.stringify(state)));
}

export function deserializeState(encoded: string): ViewerState {
  return JSON.parse(decodeURIComponent(atob(encoded))) as ViewerState;
}
