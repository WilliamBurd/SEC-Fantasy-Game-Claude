"use server";

import { getProfile, getUser } from "@/lib/auth/dal";
import { parseSaveRequest, slotsToRow, type LineupSlots } from "@/lib/lineup/rules";
import { createClient } from "@/lib/supabase/server";

export type SaveLineupResult = { ok: true; totalSalary: number } | { ok: false; error: string };

// Postgres error codes: raised by validate_lineup(), and unique_violation.
const RULE_BROKEN = "P0001";
const ALREADY_EXISTS = "23505";

/**
 * Saves the signed-in user's lineup for a week. The database's
 * validate_lineup() trigger checks every rule; if it refuses, its message is
 * passed back for the builder to show.
 */
export async function saveLineup(input: { season: number; week: number; slots: LineupSlots }): Promise<SaveLineupResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "You've been signed out. Sign in again to save your lineup." };
  if (!(await getProfile())) return { ok: false, error: "Pick a username before saving a lineup." };

  const request = parseSaveRequest(input);
  if (!request.ok) return { ok: false, error: "That lineup couldn't be read. Reload the page and try again." };
  const { season, week, slots } = request;
  const columns = slotsToRow(slots);

  const supabase = await createClient();
  const update = () =>
    supabase
      .from("lineups")
      .update(columns)
      .eq("user_id", user.id)
      .eq("season", season)
      .eq("week", week)
      .select("total_salary")
      .maybeSingle();

  let result = await update();
  if (!result.error && !result.data) {
    // No lineup for this week yet.
    result = await supabase
      .from("lineups")
      .insert({ user_id: user.id, season, week, ...columns })
      .select("total_salary")
      .single();
    // Saved from another tab in the meantime: update that one instead.
    if (result.error?.code === ALREADY_EXISTS) result = await update();
  }

  if (result.error) {
    if (result.error.code === RULE_BROKEN) return { ok: false, error: result.error.message };
    console.error("saveLineup:", result.error);
    return { ok: false, error: "Couldn't save your lineup. Please try again." };
  }
  if (!result.data) return { ok: false, error: "Couldn't save your lineup. Please try again." };
  return { ok: true, totalSalary: result.data.total_salary };
}
