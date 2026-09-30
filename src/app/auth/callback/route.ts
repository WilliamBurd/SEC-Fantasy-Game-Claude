import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Google sign-in and email links (confirm email, reset password) land.
 * Swaps the one-time code for a session cookie, then carries on to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL("/login?error=link", request.url));
}
