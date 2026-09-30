"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getProfile, getUser } from "@/lib/auth/dal";
import { isUuid, normalizeInviteCode, validateLeagueName } from "@/lib/leagues/validation";
import { createClient } from "@/lib/supabase/server";

export type LeagueFormState = { error?: string; message?: string; value?: string } | undefined;

// Raised by the league functions and triggers with a message for the user.
const RULE_BROKEN = "P0001";

async function signedInClient() {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/leagues")}`);
  if (!(await getProfile())) redirect(`/onboarding?next=${encodeURIComponent("/leagues")}`);
  return { user, supabase: await createClient() };
}

function failure(error: { code?: string; message: string }, fallback: string, value?: string): LeagueFormState {
  if (error.code === RULE_BROKEN) return { error: error.message, value };
  console.error("league action:", error);
  return { error: fallback, value };
}

/** Creates a league (the database picks the invite code) and opens it. */
export async function createLeague(_state: LeagueFormState, formData: FormData): Promise<LeagueFormState> {
  const raw = String(formData.get("name") ?? "");
  const result = validateLeagueName(raw);
  if ("error" in result) return { error: result.error, value: raw };

  const { supabase } = await signedInClient();
  const { data, error } = await supabase.rpc("create_league", { p_name: result.name }).single<{ id: string }>();
  if (error || !data) return failure(error ?? { message: "no league returned" }, "Couldn't create the league. Please try again.", raw);
  revalidatePath("/leagues");
  redirect(`/leagues/${data.id}`);
}

/** Joins the league with this invite code and opens it. */
export async function joinLeague(_state: LeagueFormState, formData: FormData): Promise<LeagueFormState> {
  const raw = String(formData.get("code") ?? "");
  const result = normalizeInviteCode(raw);
  if ("error" in result) return { error: result.error, value: raw };

  const { supabase } = await signedInClient();
  const { data, error } = await supabase.rpc("join_league", { p_invite_code: result.code }).single<{ id: string }>();
  if (error || !data) return failure(error ?? { message: "no league returned" }, "Couldn't join the league. Please try again.", raw);
  revalidatePath("/leagues");
  redirect(`/leagues/${data.id}`);
}

/** Renames a league; only its admin can (RLS). */
export async function renameLeague(_state: LeagueFormState, formData: FormData): Promise<LeagueFormState> {
  const id = formData.get("leagueId");
  const raw = String(formData.get("name") ?? "");
  if (!isUuid(id)) return { error: "That league couldn't be found." };
  const result = validateLeagueName(raw);
  if ("error" in result) return { error: result.error, value: raw };

  const { supabase } = await signedInClient();
  const { data, error } = await supabase.from("leagues").update({ name: result.name }).eq("id", id).select("id");
  if (error) return failure(error, "Couldn't rename the league. Please try again.", raw);
  if (!data?.length) return { error: "Only the league's creator can rename it.", value: raw };
  revalidatePath(`/leagues/${id}`);
  revalidatePath("/leagues");
  return { message: "League renamed.", value: result.name };
}

/** Leaves a league. The league's admin can't (the database refuses); they delete it instead. */
export async function leaveLeague(_state: LeagueFormState, formData: FormData): Promise<LeagueFormState> {
  const id = formData.get("leagueId");
  if (!isUuid(id)) return { error: "That league couldn't be found." };
  const { user, supabase } = await signedInClient();
  const { error } = await supabase.from("league_members").delete().eq("league_id", id).eq("user_id", user.id);
  if (error) return failure(error, "Couldn't leave the league. Please try again.");
  revalidatePath("/leagues");
  redirect("/leagues");
}

/** Deletes a league and its memberships; only its admin can (RLS). */
export async function deleteLeague(_state: LeagueFormState, formData: FormData): Promise<LeagueFormState> {
  const id = formData.get("leagueId");
  if (!isUuid(id)) return { error: "That league couldn't be found." };
  const { supabase } = await signedInClient();
  const { data, error } = await supabase.from("leagues").delete().eq("id", id).select("id");
  if (error) return failure(error, "Couldn't delete the league. Please try again.");
  if (!data?.length) return { error: "Only the league's creator can delete it." };
  revalidatePath("/leagues");
  redirect("/leagues");
}
