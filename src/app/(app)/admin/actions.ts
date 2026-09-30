"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loadTeams } from "@/lib/admin/data";
import {
  parseCfbdId,
  parseJobWeek,
  parsePlayerForm,
  parsePlayerId,
  parseProjectionForm,
  parseSalary,
} from "@/lib/admin/forms";
import { getProfile, getUser } from "@/lib/auth/dal";
import { isJobName } from "@/lib/pipelines/jobs";
import { seasonFor } from "@/lib/pipelines/season";
import { createClient } from "@/lib/supabase/server";

/**
 * The admin screen's writes. Each runs as the signed-in admin: RLS
 * (is_admin()) decides what they may change, and the database's triggers
 * log every change and enforce the rules (20261005000000_admin_screen.sql).
 */

export type AdminFormState = { error?: string; message?: string } | undefined;
export type JobRunState = { error?: string; result?: string; ranAt?: string } | undefined;

const RULE_BROKEN = "P0001";
const ALREADY_EXISTS = "23505";

async function adminClient() {
  const user = await getUser();
  const profile = user ? await getProfile() : null;
  if (!user || !profile?.is_admin) return null;
  return { user, supabase: await createClient() };
}

const NOT_ADMIN: AdminFormState = { error: "Only admins can do that. Sign in again if you are one." };

function failure(error: { code?: string; message: string }, fallback: string): AdminFormState {
  if (error.code === RULE_BROKEN) return { error: error.message };
  console.error("admin action:", error);
  return { error: fallback };
}

function playerPaths(id: number) {
  revalidatePath(`/admin/players/${id}`);
  revalidatePath("/admin");
}

export async function addPlayer(_state: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const admin = await adminClient();
  if (!admin) return NOT_ADMIN;
  const teams = await loadTeams(admin.supabase);
  const parsed = parsePlayerForm((name) => formData.get(name), teams, true);
  if (!parsed.ok) return { error: parsed.error };
  const projection = parseProjectionForm((name) => formData.get(name));
  if (!projection.ok) return { error: projection.error };

  const p = parsed.value;
  const { data, error } = await admin.supabase
    .from("players")
    .insert({
      ...(p.cfbdId ? { id: p.cfbdId } : {}),
      first_name: p.firstName,
      last_name: p.lastName,
      team: p.team,
      position: p.position,
      class_year: p.classYear,
      active: p.active,
    })
    .select("id")
    .single();
  if (error?.code === ALREADY_EXISTS) return { error: `There's already a player with CFBD ID ${p.cfbdId}. Search for them instead.` };
  if (error || !data) return failure(error ?? { message: "no row" }, "Couldn't add the player. Please try again.");

  const { error: projectionError } = await admin.supabase.from("player_season_projections").insert({
    player_id: data.id,
    season: seasonFor(new Date()),
    projected_ppg: projection.value.projectedPpg,
    prior_season_ppg: projection.value.priorSeasonPpg,
  });
  if (projectionError) console.error("add player projection:", projectionError);

  revalidatePath("/admin");
  redirect(`/admin/players/${data.id}?added=1`);
}

export async function updatePlayer(_state: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const admin = await adminClient();
  if (!admin) return NOT_ADMIN;
  const id = parsePlayerId(formData.get("playerId"));
  if (id === null) return { error: "That player couldn't be found." };
  const teams = await loadTeams(admin.supabase);
  const parsed = parsePlayerForm((name) => formData.get(name), teams, false);
  if (!parsed.ok) return { error: parsed.error };

  const p = parsed.value;
  const { data, error } = await admin.supabase
    .from("players")
    .update({ first_name: p.firstName, last_name: p.lastName, team: p.team, position: p.position, class_year: p.classYear, active: p.active })
    .eq("id", id)
    .select("id");
  if (error) return failure(error, "Couldn't save the player. Please try again.");
  if (!data?.length) return { error: "That player couldn't be found." };
  playerPaths(id);
  return { message: "Player saved." };
}

export async function saveProjection(_state: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const admin = await adminClient();
  if (!admin) return NOT_ADMIN;
  const id = parsePlayerId(formData.get("playerId"));
  if (id === null) return { error: "That player couldn't be found." };
  const parsed = parseProjectionForm((name) => formData.get(name));
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await admin.supabase.from("player_season_projections").upsert(
    {
      player_id: id,
      season: seasonFor(new Date()),
      projected_ppg: parsed.value.projectedPpg,
      prior_season_ppg: parsed.value.priorSeasonPpg,
    },
    { onConflict: "player_id,season" },
  );
  if (error) return failure(error, "Couldn't save the projection. Please try again.");
  playerPaths(id);
  return { message: "Projection saved. It's used from the next pricing run." };
}

export async function setSalary(_state: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const admin = await adminClient();
  if (!admin) return NOT_ADMIN;
  const id = parsePlayerId(formData.get("playerId"));
  const week = Number(formData.get("week"));
  if (id === null || !Number.isInteger(week)) return { error: "That week couldn't be found." };
  const salary = parseSalary(formData.get("salary"));
  if (!salary.ok) return { error: salary.error };
  const season = seasonFor(new Date());
  const db = admin.supabase;

  const { data: updated, error } = await db
    .from("player_weekly_stats")
    .update({ salary: salary.value })
    .eq("player_id", id)
    .eq("season", season)
    .eq("week", week)
    .select("id");
  if (error) return failure(error, "Couldn't save the salary. Please try again.");

  if (!updated?.length) {
    // Not priced this week yet: add them to the pool at this price.
    const { data: player } = await db.from("players").select("team").eq("id", id).maybeSingle();
    if (!player) return { error: "That player couldn't be found." };
    const { data: game, error: gameError } = await db
      .from("games")
      .select("id")
      .eq("season", season)
      .eq("week", week)
      .or(`home_team.eq."${player.team}",away_team.eq."${player.team}"`)
      .maybeSingle();
    if (gameError || !game) return { error: `${player.team} has no SEC game in week ${week}.` };
    const { error: insertError } = await db
      .from("player_weekly_stats")
      .insert({ player_id: id, season, week, game_id: game.id, salary: salary.value });
    if (insertError) return failure(insertError, "Couldn't add the player to the pool. Please try again.");
  }
  playerPaths(id);
  revalidatePath("/lineup");
  return { message: `Week ${week} salary set to ${salary.value}.` };
}

export async function clearSalaryOverride(_state: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const admin = await adminClient();
  if (!admin) return NOT_ADMIN;
  const id = parsePlayerId(formData.get("playerId"));
  const week = Number(formData.get("week"));
  if (id === null || !Number.isInteger(week)) return { error: "That week couldn't be found." };
  const { error } = await admin.supabase
    .from("player_weekly_stats")
    .update({ salary_overridden: false })
    .eq("player_id", id)
    .eq("season", seasonFor(new Date()))
    .eq("week", week);
  if (error) return failure(error, "Couldn't clear the override. Please try again.");
  playerPaths(id);
  return { message: `Week ${week}'s override cleared. The next pricing run sets the price.` };
}

export async function mergePlayer(_state: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const admin = await adminClient();
  if (!admin) return NOT_ADMIN;
  const id = parsePlayerId(formData.get("playerId"));
  if (id === null || id >= 0) return { error: "Only hand-added players with a temporary ID can be merged." };
  const cfbd = parseCfbdId(formData.get("cfbdId"));
  if (!cfbd.ok) return { error: cfbd.error };

  const { error } = await admin.supabase.rpc("merge_admin_player", { p_temporary_id: id, p_cfbd_id: cfbd.value });
  if (error) return failure(error, "Couldn't merge the players. Please try again.");
  playerPaths(id);
  revalidatePath(`/admin/players/${cfbd.value}`);
  redirect(`/admin/players/${cfbd.value}?merged=1`);
}

/**
 * Runs a job the same way the scheduler does: a request to this site's own
 * /api/jobs/<job> with the CRON_SECRET. That keeps the secret-key database
 * client inside the job route (CLAUDE.md) while the admin check happens here.
 */
export async function runJobNow(_state: JobRunState, formData: FormData): Promise<JobRunState> {
  const admin = await adminClient();
  if (!admin) return { error: NOT_ADMIN!.error };
  const job = String(formData.get("job") ?? "");
  if (!isJobName(job)) return { error: "Unknown job." };
  const week = parseJobWeek(formData.get("week"));
  if (!week.ok) return { error: week.error };
  const secret = process.env.CRON_SECRET;
  if (!secret) return { error: "CRON_SECRET isn't set on the server, so jobs can't be run." };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  if (!host) return { error: "Couldn't work out this site's address." };
  const url = new URL(`/api/jobs/${job}`, `${proto}://${host}`);
  if (week.value !== null) url.searchParams.set("week", String(week.value));
  if (job === "injury-report") url.searchParams.set("force", "1");

  try {
    const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { result?: unknown; error?: string } | null;
    const ranAt = new Date().toISOString();
    if (!response.ok || !body || body.error) {
      return { error: body?.error ?? `The job failed (HTTP ${response.status}).`, ranAt };
    }
    revalidatePath("/admin", "layout");
    return { result: JSON.stringify(body.result, null, 2), ranAt };
  } catch (error) {
    console.error("runJobNow:", error);
    return { error: "Couldn't reach the job. It may still be running; check the change log in a minute." };
  }
}
