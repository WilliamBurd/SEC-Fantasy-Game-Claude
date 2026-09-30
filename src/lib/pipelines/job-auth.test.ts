import { describe, expect, it } from "vitest";

import { cronSecret, isJobAuthorized } from "./job-auth";

describe("cronSecret", () => {
  it("trims what was pasted", () => {
    expect(cronSecret("  abc123\n")).toBe("abc123");
    expect(cronSecret("   ")).toBeNull();
    expect(cronSecret("")).toBeNull();
  });
});

describe("isJobAuthorized", () => {
  it("accepts the secret, ignoring spaces around it", () => {
    expect(isJobAuthorized("Bearer abc123", "abc123")).toBe(true);
    expect(isJobAuthorized("Bearer abc123 ", "abc123")).toBe(true);
    expect(isJobAuthorized("bearer  abc123", "abc123")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isJobAuthorized("Bearer abc124", "abc123")).toBe(false);
    expect(isJobAuthorized("Bearer abc1234", "abc123")).toBe(false);
    expect(isJobAuthorized("abc123", "abc123")).toBe(false);
    expect(isJobAuthorized("Bearer ", "abc123")).toBe(false);
    expect(isJobAuthorized(null, "abc123")).toBe(false);
    expect(isJobAuthorized("Bearer abc123", null)).toBe(false);
  });
});
