import { describe, it, expect } from "vitest";
import {
  defaultScene, createStore, serializeScene, deserializeScene,
  addPane, duplicatePane, deletePane, selectPane, updateSelected, getSelected, migrateScene,
} from "./store";

describe("scene store", () => {
  it("serialize/deserialize round-trips a scene", () => {
    const s = defaultScene();
    s.panes[0].text = "hello";
    s.panes[0].rotation = { x: 0.1, y: 0.2, z: 0.3 };
    const restored = deserializeScene(serializeScene(s));
    expect(restored).toEqual(s);
  });

  it("notifies subscribers on set/update", () => {
    const store = createStore(defaultScene());
    let calls = 0;
    store.subscribe(() => calls++);
    store.set({ camera: { ...store.get().camera, zoom: 2 } });
    store.update((s) => updateSelected(s, { scale: 2 }));
    expect(store.get().camera.zoom).toBe(2);
    expect(getSelected(store.get()).scale).toBe(2);
    expect(calls).toBe(2);
  });

  it("adds, duplicates, deletes panes and keeps at least one", () => {
    let s = defaultScene();
    expect(s.panes).toHaveLength(1);
    s = addPane(s);
    expect(s.panes).toHaveLength(2);
    expect(s.selectedId).toBe(s.panes[1].id);

    s = duplicatePane(s);
    expect(s.panes).toHaveLength(3);

    const keep = s.panes[0].id;
    s = selectPane(s, keep);
    s = deletePane(s);
    expect(s.panes).toHaveLength(2);
    expect(s.panes.some((p) => p.id === keep)).toBe(false);

    s = deletePane(deletePane(s)); // try to delete past the last one
    expect(s.panes).toHaveLength(1);
  });

  it("updateSelected only touches the selected pane", () => {
    let s = addPane(defaultScene()); // 2 panes, second selected
    s = updateSelected(s, { color: "#ff0000" });
    expect(getSelected(s).color).toBe("#ff0000");
    expect(s.panes[0].color).not.toBe("#ff0000");
  });

  it("migrates a V1 flat state into a one-pane scene", () => {
    const v1 = {
      text: "GEIST", objRotation: { x: 0.5, y: 0, z: 0 }, scale: 2,
      orbit: { yaw: 1, pitch: 0 }, pan: { x: 0, y: 0 }, zoom: 1.5, fov: 1,
      shape: "circle", cellSize: 10, background: "#123456", transparent: false,
      animate: true, animMode: "marquee", animSpeed: 100,
    };
    const scene = migrateScene(v1);
    expect(scene.panes).toHaveLength(1);
    expect(scene.panes[0].text).toBe("GEIST");
    expect(scene.panes[0].rotation.x).toBe(0.5);
    expect(scene.panes[0].shape).toBe("circle");
    expect(scene.camera.zoom).toBe(1.5);
    expect(scene.background.color).toBe("#123456");
    expect(scene.background.transparent).toBe(false);
  });
});
