import type { CfbdGamePlayerStats, CfbdSeasonType } from "@/lib/cfbd/types";
import { parseGamePlayerStats, type StatLine } from "@/lib/scoring/box-score";

import type { JobContext } from "./context";
import { selectAll, upsertAll } from "./db";

export type GameStatRow = { player_id: number; week: number; fantasy_points: number };

/** Points per game and games played for each player, from player_game_stats rows. */
export function summarizeGames(rows: Pick<GameStatRow, "player_id" | "fantasy_points">[]) {
  const totals = new Map<number, { points: number; games: number }>();
  for (const row of rows) {
    const t = totals.get(row.player_id) ?? { points: 0, games: 0 };
    t.points += Number(row.fantasy_points);
    t.games += 1;
    totals.set(row.player_id, t);
  }
  return new Map(
    [...totals].map(([id, t]) => [id, { ppg: Math.round((t.points / t.games) * 100) / 100, games: t.games }]),
  );
}

export async function loadPlayerIds(ctx: JobContext): Promise<Set<number>> {
  const rows = await selectAll<{ id: number }>("load player ids", (from, to) =>
    ctx.db.from("players").select("id").order("id").range(from, to),
  );
  return new Set(rows.map((r) => r.id));
}

/**
 * Parses box scores and stores the stat lines of players in the players
 * table into player_game_stats. Returns every parsed line, known or not.
 */
export async function storeGameStats(
  ctx: JobContext,
  input: {
    season: number;
    seasonType: CfbdSeasonType;
    boxScores: CfbdGamePlayerStats[];
    /** CFBD game id -> week, for box scores fetched without a week. */
    weekOfGame: (gameId: number) => number | undefined;
    playerIds: Set<number>;
  },
): Promise<StatLine[]> {
  const lines = parseGamePlayerStats(input.boxScores);
  const rows = lines
    .filter((line) => input.playerIds.has(line.player_id))
    .flatMap((line) => {
      const week = input.weekOfGame(line.game_id);
      return week === undefined ? [] : [{ ...line, season: input.season, week, season_type: input.seasonType }];
    });
  await upsertAll(ctx.db, "player_game_stats", rows, "player_id,game_id");
  return lines;
}

/** player_game_stats rows for a season (optionally only weeks before `beforeWeek`). */
export async function loadGameStats(ctx: JobContext, season: number, beforeWeek?: number) {
  return selectAll<GameStatRow>("load game stats", (from, to) => {
    let query = ctx.db
      .from("player_game_stats")
      .select("player_id, week, fantasy_points")
      .eq("season", season);
    if (beforeWeek !== undefined) query = query.lt("week", beforeWeek).eq("season_type", "regular");
    return query.order("player_id").order("game_id").range(from, to);
  });
}
