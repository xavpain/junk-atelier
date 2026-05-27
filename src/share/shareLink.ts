import type { ViewerState } from "../types";
import { serializeState, deserializeState } from "../state/store";
import type { Store } from "../state/store";

export function buildShareUrl(base: string, state: ViewerState): string {
  const url = base.split("#")[0];
  return `${url}#${serializeState(state)}`;
}

// Reads window.location.hash and applies it to the store, if present and valid.
export function applyHashToStore(store: Store): void {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return;
  try {
    store.set(deserializeState(hash));
  } catch {
    /* ignore malformed hash */
  }
}
