import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Data access layer for sign-in state. Every page and Server Action that
 * needs the user goes through here, rather than trusting the proxy's quick
 * check. Results are cached for the length of one request.
 */

export type SessionUser = { id: string; email: string | null };
export type Profile = { id: string; username: string; is_admin: boolean };

/** The signed-in user, verified from the session token, or null. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  if (!getSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

/** The signed-in user's profile, or null if they haven't picked a username yet. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load your profile: ${error.message}`);
  return data;
});

/** For pages that need a signed-in user: sends everyone else to sign in. */
export async function requireUser(next: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** For pages that need a finished profile: sends users without one to pick a username. */
export async function requireProfile(next: string): Promise<{ user: SessionUser; profile: Profile }> {
  const user = await requireUser(next);
  const profile = await getProfile();
  if (!profile) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  return { user, profile };
}

/** For admin pages: everyone who isn't an admin gets a 404, so the page's existence isn't advertised. */
export async function requireAdmin(next: string): Promise<{ user: SessionUser; profile: Profile }> {
  const result = await requireProfile(next);
  if (!result.profile.is_admin) notFound();
  return result;
}
