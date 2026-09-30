import { describe, expect, it } from "vitest";

import { safeNextPath, suggestUsername, validateEmail, validatePassword, validateUsername } from "./validation";

describe("validateUsername", () => {
  it("accepts 3 to 20 letters, numbers and underscores", () => {
    expect(validateUsername("Bama_Fan22")).toEqual({ username: "Bama_Fan22" });
    expect(validateUsername("  abc  ")).toEqual({ username: "abc" });
    expect(validateUsername("a".repeat(20))).toEqual({ username: "a".repeat(20) });
  });
  it("rejects anything else", () => {
    expect(validateUsername("ab")).toHaveProperty("error");
    expect(validateUsername("a".repeat(21))).toHaveProperty("error");
    expect(validateUsername("bama fan")).toHaveProperty("error");
    expect(validateUsername("roll-tide")).toHaveProperty("error");
    expect(validateUsername(null)).toHaveProperty("error");
  });
});

describe("validateEmail", () => {
  it("trims and lowercases", () => {
    expect(validateEmail(" Fan@Example.COM ")).toEqual({ email: "fan@example.com" });
  });
  it("rejects malformed addresses", () => {
    expect(validateEmail("fan@example")).toHaveProperty("error");
    expect(validateEmail("fan example.com")).toHaveProperty("error");
    expect(validateEmail(undefined)).toHaveProperty("error");
  });
});

describe("validatePassword", () => {
  it("needs at least 8 characters", () => {
    expect(validatePassword("12345678")).toEqual({ password: "12345678" });
    expect(validatePassword("1234567")).toHaveProperty("error");
    expect(validatePassword(null)).toHaveProperty("error");
  });
});

describe("safeNextPath", () => {
  it("allows paths on this site", () => {
    expect(safeNextPath("/lineup")).toBe("/lineup");
    expect(safeNextPath("/leagues?code=ABC123")).toBe("/leagues?code=ABC123");
  });
  it("falls back for anything that could leave the site", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(null, "/onboarding")).toBe("/onboarding");
  });
});

describe("suggestUsername", () => {
  it("builds a valid username from an email", () => {
    expect(suggestUsername("Bama.Fan-22@example.com")).toBe("BamaFan22");
    expect(suggestUsername("averyveryverylongemailname@example.com")).toBe("averyveryverylongema");
  });
  it("returns nothing when too little is left", () => {
    expect(suggestUsername("a.b@example.com")).toBe("");
    expect(suggestUsername(null)).toBe("");
  });
});
