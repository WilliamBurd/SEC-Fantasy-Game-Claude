import { describe, expect, it } from "vitest";

import { routeAccess } from "./routes";

describe("routeAccess", () => {
  it("sends signed-out users on protected pages to sign in, remembering where they were", () => {
    expect(routeAccess("/lineup", "", false)).toEqual({ redirect: "/login?next=%2Flineup" });
    expect(routeAccess("/leagues/abc", "?tab=week", false)).toEqual({
      redirect: "/login?next=%2Fleagues%2Fabc%3Ftab%3Dweek",
    });
    expect(routeAccess("/onboarding", "", false)).toEqual({ redirect: "/login?next=%2Fonboarding" });
  });
  it("leaves public pages alone", () => {
    expect(routeAccess("/", "", false)).toBeNull();
    expect(routeAccess("/login", "", false)).toBeNull();
    expect(routeAccess("/lineups-help", "", false)).toBeNull(); // not under /lineup
  });
  it("sends signed-in users away from the sign-in pages", () => {
    expect(routeAccess("/login", "", true)).toEqual({ redirect: "/" });
    expect(routeAccess("/signup", "", true)).toEqual({ redirect: "/" });
    expect(routeAccess("/lineup", "", true)).toBeNull();
    expect(routeAccess("/reset-password", "", true)).toBeNull();
  });
});
