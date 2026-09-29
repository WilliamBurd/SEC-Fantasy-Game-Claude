import { hasScoringStats, playerNames, type StatLine } from "@/lib/scoring/box-score";

import type { JobContext } from "./context";
import { check, logChanges, selectAll, upsertAll } from "./db";
import { isContestGame, SEC } from "./season";
import { loadPlayerIds, storeGameStats } from "./stats";

/** How long after kickoff to start asking CFBD whether a game has finished. */
const CHECK_FINAL_AFTER_MS = 3 * 60 * 60 * 1000;

export type ScoringRun =
  | { status: "idle"; season: number; week: number; reason: string }
  | {
      status: "scored";
      season: number;
      week: number;
      statLines: number;
      lineupPlayersUpdated: number;
      gamesFinal: number;
      unknownPlayersFlagged: number;
    };

type WeekGame = { id: number; kickoff_at: string; status: "scheduled" | "in_progress" | "final" };

const STAT_COLUMNS = [
  "pass_yds",
  "pass_td",
  "interceptions",
  "rush_yds",
  "rush_td",
  "receptions",
  "rec_yds",
  "rec_td",
  "fumbles_lost",
] as const;

/**
 * Game day scoring (PRD Section 4). Fetches the week's SEC box scores (1 CFBD
 * call), stores every stat line, copies the pool players' lines into
 * player_weekly_stats, updates game status and recalculates every lineup's
 * total_score.
 *
 * Live mode does nothing unless one of the week's SEC-vs-SEC games has kicked
 * off and isn't final. Reconcile mode (Monday) always runs and marks every
 * finished game final, picking up stat corrections.
 */
export async function scoreWeek(
  ctx: JobContext,
  season: number,
  week: number,
  mode: "live" | "reconcile",
): Promise<ScoringRun> {
  const { data, error } = await ctx.db
    .from("games")
    .select("id, kickoff_at, status")
    .eq("season", season)
    .eq("week", week);
  check(error, "load games");
  const games = (data ?? []) as WeekGame[];
  const started = games.filter((g) => new Date(g.kickoff_at) <= ctx.now);
  const live = started.filter((g) => g.status !== "final");

  if (mode === "live" && live.length === 0) {
    return { status: "idle", season, week, reason: "No SEC-vs-SEC game is in progress." };
  }

  // Stat lines for every SEC team's game this week, non-conference included.
  const boxScores = await ctx.cfbd.gamePlayerStats({ year: season, week, conference: SEC });
  const playerIds = await loadPlayerIds(ctx);
  const lines = await storeGameStats(ctx, {
    season,
    seasonType: "regular",
    boxScores,
    weekOfGame: () => week,
    playerIds,
  });

  const lineupPlayersUpdated = await copyToWeeklyStats(ctx, season, week, lines);

  // Status: kicked-off games are in progress until CFBD says they're done.
  const toInProgress = started.filter((g) => g.status === "scheduled").map((g) => g.id);
  if (toInProgress.length > 0) {
    const { error: statusError } = await ctx.db.from("games").update({ status: "in_progress" }).in("id", toInProgress);
    check(statusError, "mark games in progress");
  }
  let gamesFinal = 0;
  const mayBeOver = live.some((g) => ctx.now.getTime() - new Date(g.kickoff_at).getTime() >= CHECK_FINAL_AFTER_MS);
  if (mode === "reconcile" || mayBeOver) {
    const weekIds = new Set(games.map((g) => g.id));
    const completed = (await ctx.cfbd.games(season, SEC, "regular"))
      .filter((g) => isContestGame(g) && g.completed && weekIds.has(g.id))
      .map((g) => g.id);
    if (completed.length > 0) {
      const { error: finalError } = await ctx.db.from("games").update({ status: "final" }).in("id", completed);
      check(finalError, "mark games final");
    }
    gamesFinal = completed.length;
  }

  const { error: refreshError } = await ctx.db.rpc("refresh_lineup_scores", { p_season: season, p_week: week });
  check(refreshError, "refresh lineup scores");

  const unknownPlayersFlagged = await flagUnknownPlayers(ctx, {
    season,
    week,
    lines,
    contestGameIds: new Set(games.map((g) => g.id)),
    playerIds,
    names: playerNames(boxScores),
  });

  return {
    status: "scored",
    season,
    week,
    statLines: lines.length,
    lineupPlayersUpdated,
    gamesFinal,
    unknownPlayersFlagged,
  };
}

/** Copies stat lines onto the week's player_weekly_stats rows for the same game. */
async function copyToWeeklyStats(ctx: JobContext, season: number, week: number, lines: StatLine[]) {
  const rows = await selectAll<{ player_id: number; game_id: number; salary: number }>("load weekly rows", (from, to) =>
    ctx.db
      .from("player_weekly_stats")
      .select("player_id, game_id, salary")
      .eq("season", season)
      .eq("week", week)
      .order("player_id")
      .range(from, to),
  );
  const lineOf = new Map(lines.map((l) => [`${l.player_id}:${l.game_id}`, l]));

  const updates = rows.flatMap((row) => {
    const line = lineOf.get(`${row.player_id}:${row.game_id}`);
    if (!line) return [];
    const stats = Object.fromEntries(STAT_COLUMNS.map((c) => [c, line[c]]));
    // salary and game_id are included because an upsert must carry every
    // required column, even when the row already exists.
    return [{ player_id: row.player_id, season, week, game_id: row.game_id, salary: row.salary, ...stats }];
  });
  await upsertAll(ctx.db, "player_weekly_stats", updates, "player_id,week,season");
  return updates.length;
}

/**
 * Logs players who scored in an SEC-vs-SEC game but aren't in the players
 * table, once per player per season, so an admin can add them.
 */
async function flagUnknownPlayers(
  ctx: JobContext,
  input: {
    season: number;
    week: number;
    lines: StatLine[];
    contestGameIds: Set<number>;
    playerIds: Set<number>;
    names: Map<number, string>;
  },
) {
  const unknown = input.lines.filter(
    (l) => input.contestGameIds.has(l.game_id) && !input.playerIds.has(l.player_id) && hasScoringStats(l),
  );
  if (unknown.length === 0) return 0;

  const { data, error } = await ctx.db
    .from("change_log")
    .select("details")
    .eq("action", "unknown_player")
    .eq("details->>season", String(input.season));
  check(error, "load unknown players");
  const alreadyFlagged = new Set((data ?? []).map((row) => Number(row.details?.cfbd_player_id)));

  const fresh = unknown.filter((l) => !alreadyFlagged.has(l.player_id));
  await logChanges(
    ctx.db,
    fresh.map((l) => ({
      action: "unknown_player",
      details: {
        season: input.season,
        week: input.week,
        cfbd_player_id: l.player_id,
        name: input.names.get(l.player_id) ?? null,
        team: l.team,
        game_id: l.game_id,
      },
    })),
  );
  return fresh.length;
}
