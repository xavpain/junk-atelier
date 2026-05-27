import { describe, it, expect } from "vitest";
import { buildShareUrl } from "./shareLink";
import { defaultState, deserializeState } from "../state/store";

describe("buildShareUrl", () => {
  it("encodes state into the URL hash and round-trips", () => {
    const s = defaultState();
    s.text = "share me";
    const url = buildShareUrl("https://example.com/app", s);
    expect(url).toContain("#");
    const hash = url.split("#")[1];
    expect(deserializeState(hash).text).toBe("share me");
  });
});
