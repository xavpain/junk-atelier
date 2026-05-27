import { describe, it, expect } from "vitest";
import { defaultState, createStore, serializeState, deserializeState } from "./store";

describe("store", () => {
  it("serialize/deserialize round-trips the full state", () => {
    const s = defaultState();
    s.text = "hello";
    s.objRotation = { x: 0.1, y: 0.2, z: 0.3 };
    s.scale = 1.5;
    const restored = deserializeState(serializeState(s));
    expect(restored).toEqual(s);
  });

  it("notifies subscribers on set and merges patches", () => {
    const store = createStore(defaultState());
    let calls = 0;
    store.subscribe(() => calls++);
    store.set({ scale: 2 });
    expect(store.get().scale).toBe(2);
    expect(calls).toBe(1);
  });
});
