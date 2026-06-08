import type { Scene } from "../types";
import { serializeScene, deserializeScene } from "../state/store";
import type { Store } from "../state/store";

export function buildShareUrl(base: string, scene: Scene): string {
  const url = base.split("#")[0];
  return `${url}#${serializeScene(scene)}`;
}

// Reads window.location.hash and applies it to the store, if present and valid.
// Handles both V2 Scene links and legacy V1 flat-state links (via migration).
export function applyHashToStore(store: Store): void {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return;
  try {
    store.set(deserializeScene(hash));
  } catch {
    /* ignore malformed hash */
  }
}
