import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { routeAccess } from "@/lib/auth/routes";

import { getSupabaseEnv } from "./env";

// Refreshes the signed-in user's session cookie on every request, and sends
// signed-out users on protected pages to sign in (a quick, cookie-only check;
// pages check again on the server).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getSupabaseEnv();
  if (!env) return response;

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Don't run code between createServerClient and getClaims(): it validates
  // the session and triggers the cookie refresh above.
  const { data } = await supabase.auth.getClaims();

  const decision = routeAccess(request.nextUrl.pathname, request.nextUrl.search, Boolean(data?.claims));
  if (decision) {
    const redirect = NextResponse.redirect(new URL(decision.redirect, request.url));
    // Keep any refreshed session cookies.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  return response;
}
