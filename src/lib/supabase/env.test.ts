import { describe, expect, it } from "vitest";

import { normalizeSupabaseUrl } from "./env";

describe("normalizeSupabaseUrl", () => {
  const url = "https://abcdefghijklmnop.supabase.co";

  it("keeps a correct URL", () => {
    expect(normalizeSupabaseUrl(url)).toBe(url);
  });

  it("fixes common paste mistakes", () => {
    expect(normalizeSupabaseUrl(`"${url}"`)).toBe(url);
    expect(normalizeSupabaseUrl(` '${url}' `)).toBe(url);
    expect(normalizeSupabaseUrl("abcdefghijklmnop.supabase.co")).toBe(url);
    expect(normalizeSupabaseUrl(`${url}/rest/v1/`)).toBe(url);
    expect(normalizeSupabaseUrl(`${url}/`)).toBe(url);
  });

  it("returns null when there's no usable URL", () => {
    expect(normalizeSupabaseUrl(undefined)).toBeNull();
    expect(normalizeSupabaseUrl("  ")).toBeNull();
    expect(normalizeSupabaseUrl('""')).toBeNull();
    expect(normalizeSupabaseUrl("not a url")).toBeNull();
  });
});
