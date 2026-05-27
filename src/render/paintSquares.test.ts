import { describe, it, expect } from "vitest";
import { paintSquares } from "./paintSquares";

describe("paintSquares", () => {
  it("fills a cell-sized block of RGBA pixels", () => {
    const w = 4, h = 4;
    const buf = new Uint8ClampedArray(w * h * 4);
    paintSquares(buf, w, h, [{ sx: 0, sy: 0 }], 2, [255, 255, 255, 255]);
    // (0,0) painted white
    expect([buf[0], buf[1], buf[2], buf[3]]).toEqual([255, 255, 255, 255]);
    // (1,1) painted white -> index (1*4 + 1)*4 = 20
    expect([buf[20], buf[21], buf[22], buf[23]]).toEqual([255, 255, 255, 255]);
    // (2,0) NOT painted -> index 8
    expect([buf[8], buf[9], buf[10], buf[11]]).toEqual([0, 0, 0, 0]);
  });
});
