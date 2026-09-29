import { fetchCoversInjuries, parseCoversInjuries, reportedOn } from "@/lib/injuries/covers";
import { matchInjuries, type MatchablePlayer, type UnmatchedInjury } from "@/lib/injuries/match";
import { checkInjuryReport } from "@/lib/injuries/safety";

import type { JobContext } from "./context";
import { check, logChanges, selectAll, upsertAll } from "./db";

export type InjuryRun =
  | { status: "skipped"; reason: string }
  | {
      status: "updated";
      listed: number;
      matched: number;
      cleared: number;
      keptOverrides: number;
      unmatched: number;
      unmatchedLogged: number;
    };

type StoredInjury = { player_id: number; admin_override: boolean };

/**
 * Injury report (display only; it doesn't affect pricing). Reads the Covers
 * report (1 request), matches its SEC QB/RB/WR/TE entries to our players and
 * replaces the stored statuses:
 * - Rows an admin overrode are left alone.
 * - A player no longer listed is cleared, but only for teams on the page, so
 *   a team missing from one read keeps its entries. Players who have left
 *   the pool (inactive) are cleared too.
 * - If the page looks wrong (see checkInjuryReport), nothing is written and
 *   the skip is logged, so a broken read never wipes good data.
 * - Names that don't match a player are logged once per season.
 */
export async function injuryReport(ctx: JobContext, season: number): Promise<InjuryRun> {
  const report = parseCoversInjuries(await fetchCoversInjuries());

  const players = await selectAll<MatchablePlayer>("load players", (from, to) =>
    ctx.db
      .from("players")
      .select("id, first_name, last_name, team, position")
      .eq("active", true)
      .order("id")
      .range(from, to),
  );
  const teams = [...new Set(players.map((p) => p.team))];
  const match = matchInjuries(report, players, teams);

  const stored = await selectAll<StoredInjury>("load injuries", (from, to) =>
    ctx.db.from("player_injuries").select("player_id, admin_override").order("player_id").range(from, to),
  );
  const teamOf = new Map(players.map((p) => [p.id, p.team]));

  const safety = checkInjuryReport(report, match, teams.length, stored.filter((r) => !r.admin_override).length);
  if (!safety.ok) {
    await logChanges(ctx.db, [{ action: "injury_report_skipped", details: { season, reason: safety.reason } }]);
    return { status: "skipped", reason: safety.reason };
  }

  const overridden = new Set(stored.filter((r) => r.admin_override).map((r) => r.player_id));
  const rows = match.matched
    .filter((m) => m.injury.status !== null && !overridden.has(m.playerId))
    .map((m) => ({
      player_id: m.playerId,
      status: m.injury.status,
      injury: m.injury.injury,
      note: m.injury.note,
      source: "covers",
      reported_on: reportedOn(m.injury.dateText, ctx.now),
      admin_override: false,
    }));
  await upsertAll(ctx.db, "player_injuries", rows, "player_id");

  const listedNow = new Set(match.matched.map((m) => m.playerId));
  const teamsOnPage = new Set(match.teamsInReport);
  const toClear = stored
    .filter((r) => {
      const team = teamOf.get(r.player_id);
      return !r.admin_override && !listedNow.has(r.player_id) && (team === undefined || teamsOnPage.has(team));
    })
    .map((r) => r.player_id);
  if (toClear.length > 0) {
    const { error } = await ctx.db.from("player_injuries").delete().in("player_id", toClear).eq("admin_override", false);
    check(error, "clear injuries");
  }

  const unmatchedLogged = await logUnmatched(ctx, season, match.unmatched);
  await logChanges(ctx.db, [
    {
      action: "injury_report",
      details: {
        season,
        source: "covers",
        listed: match.matched.length + match.unmatched.length,
        updated: rows.length,
        cleared: toClear.length,
        unmatched: match.unmatched.length,
      },
    },
  ]);

  return {
    status: "updated",
    listed: match.matched.length + match.unmatched.length,
    matched: rows.length,
    cleared: toClear.length,
    keptOverrides: overridden.size,
    unmatched: match.unmatched.length,
    unmatchedLogged,
  };
}

/** Logs report names that matched no player (or several), once per name per season. */
async function logUnmatched(ctx: JobContext, season: number, unmatched: UnmatchedInjury[]) {
  if (unmatched.length === 0) return 0;
  const key = (team: string, name: string, position: string) => `${team}|${name}|${position}`;

  const { data, error } = await ctx.db
    .from("change_log")
    .select("details")
    .eq("action", "injury_unmatched")
    .eq("details->>season", String(season));
  check(error, "load unmatched injuries");
  const already = new Set(
    (data ?? []).map((row) => key(row.details?.team, row.details?.name, row.details?.position)),
  );

  const fresh = unmatched.filter((u) => !already.has(key(u.team, u.injury.name, u.injury.position)));
  await logChanges(
    ctx.db,
    fresh.map((u) => ({
      action: "injury_unmatched",
      details: {
        season,
        source: "covers",
        team: u.team,
        name: u.injury.name,
        position: u.injury.position,
        status: u.injury.statusText,
        reason: u.reason,
        candidates: u.candidates ?? null,
      },
    })),
  );
  return fresh.length;
}
