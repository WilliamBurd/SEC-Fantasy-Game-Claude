import "server-only";

import { check, loadPricedWeeks, loadSettings, selectAll, type Db } from "@/lib/pipelines/db";
import { seasonFor } from "@/lib/pipelines/season";

import { slotsFromRow, type InjuryStatus, type LineupSlots, type PoolPlayer, type Position } from "./rules";
import { pickLineupWeek, type LineupWeek } from "./week";

/** Everything the lineup page needs, read as the signed-in user (RLS applies). */
export type LineupPageData = {
  season: number;
  status: LineupWeek;
  players: PoolPlayer[];
  saved: LineupSlots;
  hasLineup: boolean;
  totalScore: number;
};

type PoolRow = {
  player_id: number;
  salary: number;
  blended_ppg: number | string | null;
  fantasy_points: number | string | null;
  players: { first_name: string; last_name: string; team: string; position: Position; active: boolean };
  games: { home_team: string; away_team: string; kickoff_at: string };
};

type InjuryRow = { player_id: number; status: InjuryStatus; injury: string | null; note: string | null };

export async function loadLineupPage(db: Db, userId: string, now: Date): Promise<LineupPageData> {
  const season = seasonFor(now);
  const [{ season: seasonSettings }, gamesResult] = await Promise.all([
    loadSettings(db),
    db.from("games").select("week, kickoff_at").eq("season", season),
  ]);
  check(gamesResult.error, "load games");
  const games = gamesResult.data ?? [];

  const weeks = [...new Set(games.map((g) => g.week as number))].filter((w) => w >= seasonSettings.first_contest_week);
  const priced = await loadPricedWeeks(db, season, weeks);
  const status = pickLineupWeek(games, priced, now, seasonSettings.first_contest_week);
  if (status.kind === "none") {
    return { season, status, players: [], saved: slotsFromRow(null), hasLineup: false, totalScore: 0 };
  }

  const week = status.week;
  const [poolRows, injuriesResult, lineupResult] = await Promise.all([
    selectAll<PoolRow>("load player pool", (from, to) =>
      db
        .from("player_weekly_stats")
        .select(
          "player_id, salary, blended_ppg, fantasy_points, " +
            "players!inner(first_name, last_name, team, position, active), " +
            "games!inner(home_team, away_team, kickoff_at)",
        )
        .eq("season", season)
        .eq("week", week)
        .order("player_id")
        .range(from, to)
        .overrideTypes<PoolRow[], { merge: false }>(),
    ),
    db.from("player_injuries").select("player_id, status, injury, note"),
    db
      .from("lineups")
      .select("qb_id, rb1_id, rb2_id, wr1_id, wr2_id, te_id, flex_id, total_score")
      .eq("user_id", userId)
      .eq("season", season)
      .eq("week", week)
      .maybeSingle(),
  ]);
  check(injuriesResult.error, "load injuries");
  check(lineupResult.error, "load lineup");

  const injuries = new Map((injuriesResult.data as InjuryRow[]).map((row) => [row.player_id, row]));
  const players = poolRows.map((row) => toPoolPlayer(row, injuries.get(row.player_id)));
  const lineup = lineupResult.data;
  return {
    season,
    status,
    players,
    saved: slotsFromRow(lineup),
    hasLineup: lineup !== null,
    totalScore: Number(lineup?.total_score ?? 0),
  };
}

function toPoolPlayer(row: PoolRow, injury: InjuryRow | undefined): PoolPlayer {
  const { players: p, games: g } = row;
  const home = g.home_team === p.team;
  return {
    id: row.player_id,
    name: `${p.first_name} ${p.last_name}`.trim(),
    team: p.team,
    position: p.position,
    active: p.active,
    salary: row.salary,
    blendedPpg: row.blended_ppg === null ? null : Number(row.blended_ppg),
    weekPoints: Number(row.fantasy_points ?? 0),
    opponent: home ? g.away_team : g.home_team,
    home,
    kickoffAt: g.kickoff_at,
    injury: injury ? { status: injury.status, injury: injury.injury, note: injury.note } : null,
  };
}
