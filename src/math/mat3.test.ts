import { describe, it, expect } from "vitest";
import { mat3Identity, mat3Mul, mat3MulVec, mat3Inverse } from "./mat3";

describe("mat3", () => {
  it("identity leaves a vector unchanged", () => {
    expect(mat3MulVec(mat3Identity(), 2, 3)).toEqual([2, 3, 1]);
  });

  it("multiplies identity by identity to get identity", () => {
    expect(mat3Mul(mat3Identity(), mat3Identity())).toEqual(mat3Identity());
  });

  it("inverts a scale matrix", () => {
    const scale = [2, 0, 0, 0, 2, 0, 0, 0, 1];
    const inv = mat3Inverse(scale);
    expect(inv[0]).toBeCloseTo(0.5);
    expect(inv[4]).toBeCloseTo(0.5);
    expect(inv[8]).toBeCloseTo(1);
  });

  it("inverse times original is identity", () => {
    const m = [1, 2, 0, 0, 1, 0, 3, 0, 1];
    const prod = mat3Mul(m, mat3Inverse(m));
    for (let i = 0; i < 9; i++) expect(prod[i]).toBeCloseTo(mat3Identity()[i]);
  });
});
