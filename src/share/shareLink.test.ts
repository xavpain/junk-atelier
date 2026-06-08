import { describe, it, expect } from "vitest";
import { buildShareUrl } from "./shareLink";
import { defaultScene, deserializeScene } from "../state/store";

describe("buildShareUrl", () => {
  it("encodes a scene into the URL hash and round-trips", () => {
    const s = defaultScene();
    s.panes[0].text = "share me";
    const url = buildShareUrl("https://example.com/app", s);
    expect(url).toContain("#");
    const hash = url.split("#")[1];
    expect(deserializeScene(hash).panes[0].text).toBe("share me");
  });
});
