import "server-only";

import { check, loadPricedWeeks, loadSettings, type Db } from "@/lib/pipelines/db";
import { seasonFor } from "@/lib/pipelines/season";

import { firstKickoff, isWeekLive, startedWeeks, type BoardGame, type BoardView } from "./weeks";

/** The season's schedule, as the leaderboards need it. */
export type BoardSchedule = {
  season: number;
  weeks: number[];
  games: BoardGame[];
  /** The next contest kickoff, while no priced week has started. */
  startsAt: { week: number; kickoffAt: string } | null;
};

export async function loadSchedule(db: Db, now: Date): Promise<BoardSchedule> {
  const season = seasonFor(now);
  const [{ season: settings }, gamesResult] = await Promise.all([
    loadSettings(db),
    db.from("games").select("week, kickoff_at, status").eq("season", season),
  ]);
  check(gamesResult.error, "load games");
  const games = (gamesResult.data ?? []) as BoardGame[];
  // Only weeks that were priced had a contest (the first weeks may have had games but no prices).
  const started = startedWeeks(games, now, settings.first_contest_week);
  const priced = await loadPricedWeeks(db, season, started);
  const weeks = started.filter((w) => priced.has(w));
  return {
    season,
    weeks,
    games,
    startsAt: weeks.length === 0 ? firstKickoff(games, settings.first_contest_week, now) : null,
  };
}

export type BoardRow = {
  userId: string;
  username: string;
  weekScore: number;
  seasonScore: number;
  weekRank: number;
  seasonRank: number;
};

export type Board = {
  rows: BoardRow[];
  /** Everyone on the board, not just the rows shown. */
  total: number;
  /** The signed-in user's row when it isn't among `rows`. */
  me: BoardRow | null;
  live: boolean;
};

type RpcRow = {
  user_id: string;
  username: string;
  week_score: number | string;
  season_score: number | string;
  week_rank: number;
  season_rank: number;
};

/**
 * Arguments for leaderboard(). The global board leaves p_league_id out (it
 * defaults to NULL): a count-only request sends arguments in the URL, where
 * null would arrive as the text "null".
 */
function boardArgs(season: number, week: number, leagueId?: string) {
  return leagueId ? { p_season: season, p_week: week, p_league_id: leagueId } : { p_season: season, p_week: week };
}

const toRow = (r: RpcRow): BoardRow => ({
  userId: r.user_id,
  username: r.username,
  weekScore: Number(r.week_score),
  seasonScore: Number(r.season_score),
  weekRank: Number(r.week_rank),
  seasonRank: Number(r.season_rank),
});

/**
 * One page of a leaderboard (global, or a league's with `leagueId`), best
 * first by the chosen view, plus the signed-in user's own row.
 */
export async function loadBoard(
  db: Db,
  options: {
    schedule: BoardSchedule;
    week: number;
    view: BoardView;
    userId: string;
    leagueId?: string;
    limit: number;
    now: Date;
  },
): Promise<Board> {
  const { schedule, week, view, userId, leagueId, limit, now } = options;
  const args = boardArgs(schedule.season, week, leagueId);
  const [first, second] = view === "week" ? ["week_rank", "season_rank"] : ["season_rank", "week_rank"];

  const [page, mine] = await Promise.all([
    db
      .rpc("leaderboard", args, { count: "exact" })
      .order(first)
      .order(second)
      .order("username")
      .range(0, limit - 1),
    db.rpc("leaderboard", args).eq("user_id", userId).maybeSingle(),
  ]);
  check(page.error, "load leaderboard");
  check(mine.error, "load your leaderboard row");

  const rows = ((page.data ?? []) as RpcRow[]).map(toRow);
  const me = mine.data ? toRow(mine.data as RpcRow) : null;
  return {
    rows,
    total: page.count ?? rows.length,
    me: me && !rows.some((r) => r.userId === userId) ? me : null,
    live: isWeekLive(schedule.games, week, now),
  };
}

/** The user's season rank on the global board, or null before they've saved a lineup. */
export async function loadMyRank(
  db: Db,
  schedule: BoardSchedule,
  userId: string,
): Promise<{ rank: number; total: number } | null> {
  const args = boardArgs(schedule.season, schedule.weeks.at(-1) ?? 0);
  const [mine, all] = await Promise.all([
    db.rpc("leaderboard", args).eq("user_id", userId).maybeSingle(),
    db.rpc("leaderboard", args, { count: "exact", head: true }),
  ]);
  check(mine.error, "load your rank");
  check(all.error, "count leaderboard");
  if (!mine.data) return null;
  return { rank: Number((mine.data as RpcRow).season_rank), total: all.count ?? 0 };
}
