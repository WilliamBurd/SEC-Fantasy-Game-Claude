import { describe, expect, it } from "vitest";

import { isUuid, normalizeInviteCode, validateLeagueName } from "./validation";

describe("validateLeagueName", () => {
  it("trims and tidies spaces", () => {
    expect(validateLeagueName("  Iron   Bowl Crew ")).toEqual({ name: "Iron Bowl Crew" });
  });

  it("refuses empty and long names", () => {
    expect(validateLeagueName("   ")).toHaveProperty("error");
    expect(validateLeagueName(null)).toHaveProperty("error");
    expect(validateLeagueName("x".repeat(50))).toEqual({ name: "x".repeat(50) });
    expect(validateLeagueName("x".repeat(51))).toHaveProperty("error");
  });
});

describe("normalizeInviteCode", () => {
  it("accepts codes typed loosely", () => {
    expect(normalizeInviteCode("k7q2xm")).toEqual({ code: "K7Q2XM" });
    expect(normalizeInviteCode(" K7Q-2XM ")).toEqual({ code: "K7Q2XM" });
  });

  it("refuses anything else", () => {
    expect(normalizeInviteCode("K7Q2X")).toHaveProperty("error");
    expect(normalizeInviteCode("K7Q2XM1")).toHaveProperty("error");
    expect(normalizeInviteCode("K7Q2X!")).toHaveProperty("error");
    expect(normalizeInviteCode(undefined)).toHaveProperty("error");
  });
});

describe("isUuid", () => {
  it("checks league IDs", () => {
    expect(isUuid("0b00d46c-4175-4208-9a01-a7488b3c9381")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});
