/**
 * Which pages need a signed-in user. The proxy uses this for a quick,
 * cookie-only redirect; pages still check properly on the server (dal.ts).
 * Pure, for testing.
 */

/** Pages that need a signed-in user (and every path below them). */
export const PROTECTED_PATHS = ["/lineup", "/leaderboard", "/leagues", "/users", "/profile", "/admin", "/onboarding"];

/** Sign-in pages; a signed-in user is sent on from these. */
export const AUTH_PATHS = ["/login", "/signup"];

function under(path: string, prefixes: string[]) {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

export type RouteDecision = { redirect: string } | null;

export function routeAccess(path: string, search: string, signedIn: boolean): RouteDecision {
  if (!signedIn && under(path, PROTECTED_PATHS)) {
    return { redirect: `/login?next=${encodeURIComponent(path + search)}` };
  }
  if (signedIn && under(path, AUTH_PATHS)) {
    return { redirect: "/" };
  }
  return null;
}
