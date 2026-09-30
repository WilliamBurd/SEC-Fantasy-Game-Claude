import type { CfbdRosterPlayer } from "@/lib/cfbd/types";
import { autoProjection } from "@/lib/pricing/projection";

import type { JobContext } from "./context";
import { check, loadSettings, logChanges, selectAll, upsertAll } from "./db";
import { diffRosters, type PlayerRow } from "./roster-diff";
import { todayUtc } from "./season";

export type RosterSync = {
  added: number;
  updated: number;
  teamChanged: number;
  deactivated: number;
};

/** Every SEC roster for the season (one CFBD call per team). */
export async function fetchRosters(ctx: JobContext, season: number, teams: string[]) {
  const rosters: CfbdRosterPlayer[] = [];
  for (const team of teams) {
    rosters.push(...(await ctx.cfbd.roster(team, season)));
  }
  return rosters;
}

/**
 * Brings the players table up to date with the season's SEC rosters. New players get an automatic projection. Changes are
 * written to the change log, except on the very first sync.
 *
 * `recruitingStars` (player id -> stars) is set on players when given; the
 * preseason setup passes it, the weekly check doesn't.
 */
export async function syncRosters(
  ctx: JobContext,
  season: number,
  rosters: CfbdRosterPlayer[],
  recruitingStars?: Map<number, number>,
): Promise<RosterSync> {
  const existing = await selectAll<PlayerRow>("load players", (from, to) =>
    ctx.db
      .from("players")
      .select("id, first_name, last_name, team, position, class_year, active, source, deactivated_by_admin")
      .order("id")
      .range(from, to),
  );
  const changes = diffRosters(existing, rosters);
  const today = todayUtc(ctx.now);

  const withExtras = (p: PlayerRow) => ({
    ...p,
    last_seen_on_roster: today,
    ...(recruitingStars ? { recruiting_stars: recruitingStars.get(p.id) ?? null } : {}),
  });

  await upsertAll(ctx.db, "players", [...changes.added, ...changes.seen].map(withExtras), "id");

  if (changes.deactivated.length > 0) {
    const { error } = await ctx.db.from("players").update({ active: false }).in("id", changes.deactivated);
    check(error, "deactivate players");
  }

  // Automatic projections for new players. Their stats from last season (if
  // any) arrive with the preseason setup, which rebuilds projections anyway.
  if (changes.added.length > 0) {
    const { pricing } = await loadSettings(ctx.db);
    await upsertAll(
      ctx.db,
      "player_season_projections",
      changes.added.map((p) => ({
        player_id: p.id,
        season,
        prior_season_ppg: null,
        projected_ppg: autoProjection(
          { position: p.position, priorSeasonPpg: null, recruitingStars: recruitingStars?.get(p.id) ?? null },
          pricing,
        ),
        projection_source: "auto",
      })),
      "player_id,season",
    );
  }

  if (existing.length > 0) {
    await logChanges(ctx.db, [
      ...changes.added.map((p) => ({
        action: "player_added",
        player_id: p.id,
        details: { name: `${p.first_name} ${p.last_name}`, team: p.team, position: p.position },
      })),
      ...changes.teamChanged.map((c) => ({
        action: "player_team_changed",
        player_id: c.id,
        details: { from: c.from, to: c.to },
      })),
      ...changes.deactivated.map((id) => ({ action: "player_deactivated", player_id: id })),
      // The admin screen offers to merge these.
      ...changes.possibleMatches.map((m) => ({
        action: "admin_player_possible_match",
        player_id: m.temporaryId,
        details: { cfbd_id: m.cfbdId, name: m.name, team: m.team },
      })),
    ]);
  }

  return {
    added: changes.added.length,
    updated: changes.seen.length,
    teamChanged: changes.teamChanged.length,
    deactivated: changes.deactivated.length,
  };
}

/** Player id -> recruiting stars, from recent recruiting classes (one CFBD call per class). */
export async function recruitingStarsFor(
  ctx: JobContext,
  season: number,
  rosters: { id: string; recruitIds: string[] | null }[],
  classes = 4,
): Promise<Map<number, number>> {
  const starsByRecruitId = new Map<string, number>();
  for (let year = season - classes + 1; year <= season; year++) {
    for (const recruit of await ctx.cfbd.recruits(year)) {
      if (recruit.stars !== null) starsByRecruitId.set(recruit.id, recruit.stars);
    }
  }

  const stars = new Map<number, number>();
  for (const player of rosters) {
    const best = Math.max(0, ...(player.recruitIds ?? []).map((id) => starsByRecruitId.get(id) ?? 0));
    if (best > 0) stars.set(Number(player.id), best);
  }
  return stars;
}
