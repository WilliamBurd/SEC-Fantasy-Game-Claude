import "server-only";

import { check, loadPricedWeeks, selectAll, type Db } from "@/lib/pipelines/db";

import { LOG_FILTERS, type LogFilter } from "./change-log";

/**
 * Reads for the admin screen, as the signed-in admin (RLS lets admins read
 * the change log; everything else is readable by everyone).
 */

export const PAGE_SIZE = 50;

export async function loadTeams(db: Db): Promise<string[]> {
  const rows = await selectAll<{ team: string }>("load teams", (from, to) =>
    db.from("players").select("team").order("id").range(from, to),
  );
  return [...new Set(rows.map((r) => r.team))].sort((a, b) => a.localeCompare(b));
}

export type PlayerStatus = "all" | "active" | "inactive" | "hand-added";

export function pickStatus(value: unknown): PlayerStatus {
  return value === "active" || value === "inactive" || value === "hand-added" ? value : "all";
}

export type PlayerListRow = {
  id: number;
  name: string;
  team: string;
  position: string;
  active: boolean;
  source: "cfbd" | "admin";
  projectedPpg: number | null;
  projectionSource: string | null;
};

type PlayerRow = {
  id: number;
  first_name: string;
  last_name: string;
  team: string;
  position: string;
  active: boolean;
  source: "cfbd" | "admin";
  player_season_projections: { projected_ppg: number | string; projection_source: string }[];
};

/** Search words match first name, last name or team; every word must match. */
function searchWords(q: string): string[] {
  return q
    .replace(/[,()%*\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
}

export async function listPlayers(
  db: Db,
  options: { season: number; q: string; status: PlayerStatus; page: number },
): Promise<{ rows: PlayerListRow[]; total: number }> {
  const { season, q, status, page } = options;
  let query = db
    .from("players")
    .select("id, first_name, last_name, team, position, active, source, player_season_projections(projected_ppg, projection_source)", {
      count: "exact",
    })
    .eq("player_season_projections.season", season);
  for (const word of searchWords(q)) {
    query = query.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%,team.ilike.%${word}%`);
  }
  if (status === "active") query = query.eq("active", true);
  if (status === "inactive") query = query.eq("active", false);
  if (status === "hand-added") query = query.eq("source", "admin");

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query
    .order("last_name")
    .order("first_name")
    .range(from, from + PAGE_SIZE - 1)
    .overrideTypes<PlayerRow[], { merge: false }>();
  check(error, "load players");
  return {
    total: count ?? 0,
    rows: (data ?? []).map((p) => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      team: p.team,
      position: p.position,
      active: p.active,
      source: p.source,
      projectedPpg: p.player_season_projections[0] ? Number(p.player_season_projections[0].projected_ppg) : null,
      projectionSource: p.player_season_projections[0]?.projection_source ?? null,
    })),
  };
}

export type LogRow = {
  id: string;
  createdAt: string;
  action: string;
  details: Record<string, unknown> | null;
  playerId: number | null;
  playerName: string | null;
  by: string | null;
};

type LogDbRow = {
  id: string;
  created_at: string;
  action: string;
  details: Record<string, unknown> | null;
  player_id: number | null;
  profiles: { username: string } | null;
  players: { first_name: string; last_name: string } | null;
};

const LOG_COLUMNS = "id, created_at, action, details, player_id, profiles(username), players(first_name, last_name)";

const toLogRow = (r: LogDbRow): LogRow => ({
  id: r.id,
  createdAt: r.created_at,
  action: r.action,
  details: r.details,
  playerId: r.player_id,
  playerName: r.players ? `${r.players.first_name} ${r.players.last_name}` : null,
  by: r.profiles?.username ?? null,
});

export async function listChangeLog(db: Db, options: { filter: LogFilter; page: number }): Promise<{ rows: LogRow[]; total: number }> {
  const actions = LOG_FILTERS[options.filter].actions;
  let query = db.from("change_log").select(LOG_COLUMNS, { count: "exact" });
  if (actions === "admin") query = query.like("action", "admin\\_%");
  else if (actions) query = query.in("action", [...actions]);
  const from = (options.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
    .overrideTypes<LogDbRow[], { merge: false }>();
  check(error, "load change log");
  return { rows: (data ?? []).map(toLogRow), total: count ?? 0 };
}

export type WeekPrice = {
  week: number;
  salary: number | null;
  overridden: boolean;
  blendedPpg: number | null;
  points: number;
  opponent: string | null;
  /** The week's first kickoff has passed: salaries are closed. */
  closed: boolean;
};

export type PlayerDetail = {
  id: number;
  firstName: string;
  lastName: string;
  team: string;
  position: string;
  classYear: number | null;
  active: boolean;
  source: "cfbd" | "admin";
  deactivatedByAdmin: boolean;
  projection: { projectedPpg: number; priorSeasonPpg: number | null; source: string } | null;
  /** Priced weeks this season, plus open weeks their team plays in but they aren't priced for. */
  weeks: WeekPrice[];
  log: LogRow[];
  /** CFBD IDs the roster check thinks are this (temporary) player. */
  possibleMatches: { cfbdId: number; name: string }[];
};

type WeeklyRow = {
  week: number;
  salary: number;
  salary_overridden: boolean;
  blended_ppg: number | string | null;
  fantasy_points: number | string | null;
  games: { home_team: string; away_team: string };
};

export async function getPlayerDetail(db: Db, id: number, season: number, now: Date): Promise<PlayerDetail | null> {
  const { data: p, error } = await db
    .from("players")
    .select("id, first_name, last_name, team, position, class_year, active, source, deactivated_by_admin")
    .eq("id", id)
    .maybeSingle();
  check(error, "load player");
  if (!p) return null;

  const [projection, weekly, games, log] = await Promise.all([
    db
      .from("player_season_projections")
      .select("projected_ppg, prior_season_ppg, projection_source")
      .eq("player_id", id)
      .eq("season", season)
      .maybeSingle(),
    db
      .from("player_weekly_stats")
      .select("week, salary, salary_overridden, blended_ppg, fantasy_points, games!inner(home_team, away_team)")
      .eq("player_id", id)
      .eq("season", season)
      .order("week")
      .overrideTypes<WeeklyRow[], { merge: false }>(),
    db.from("games").select("week, kickoff_at, home_team, away_team").eq("season", season),
    db
      .from("change_log")
      .select(LOG_COLUMNS)
      .eq("player_id", id)
      .order("created_at", { ascending: false })
      .limit(25)
      .overrideTypes<LogDbRow[], { merge: false }>(),
  ]);
  check(projection.error, "load projection");
  check(weekly.error, "load salaries");
  check(games.error, "load games");
  check(log.error, "load player log");

  const firstKickoff = new Map<number, number>();
  for (const g of games.data ?? []) {
    const t = new Date(g.kickoff_at).getTime();
    firstKickoff.set(g.week, Math.min(firstKickoff.get(g.week) ?? Infinity, t));
  }
  const closed = (week: number) => (firstKickoff.get(week) ?? Infinity) <= now.getTime();
  const opponentIn = (home: string, away: string) => (home === p.team ? `vs ${away}` : `@ ${home}`);

  const weeks: WeekPrice[] = (weekly.data ?? []).map((w) => ({
    week: w.week,
    salary: w.salary,
    overridden: w.salary_overridden,
    blendedPpg: w.blended_ppg === null ? null : Number(w.blended_ppg),
    points: Number(w.fantasy_points ?? 0),
    opponent: opponentIn(w.games.home_team, w.games.away_team),
    closed: closed(w.week),
  }));
  // Weeks already priced for everyone that their team plays in, but they have
  // no price for (e.g. added after Tuesday's run): the admin can add one.
  const have = new Set(weeks.map((w) => w.week));
  const candidates = (games.data ?? []).filter(
    (g) => (g.home_team === p.team || g.away_team === p.team) && !have.has(g.week) && !closed(g.week),
  );
  const pricedWeeks = await loadPricedWeeks(db, season, [...new Set(candidates.map((g) => g.week))]);
  for (const g of candidates) {
    if (pricedWeeks.has(g.week) && !have.has(g.week)) {
      have.add(g.week);
      weeks.push({
        week: g.week,
        salary: null,
        overridden: false,
        blendedPpg: null,
        points: 0,
        opponent: opponentIn(g.home_team, g.away_team),
        closed: false,
      });
    }
  }
  weeks.sort((a, b) => a.week - b.week);

  const logRows = (log.data ?? []).map(toLogRow);
  const matches = new Map<number, string>();
  for (const r of logRows) {
    if (r.action === "admin_player_possible_match" && r.details?.cfbd_id) {
      matches.set(Number(r.details.cfbd_id), String(r.details.name ?? ""));
    }
  }

  return {
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    team: p.team,
    position: p.position,
    classYear: p.class_year,
    active: p.active,
    source: p.source,
    deactivatedByAdmin: p.deactivated_by_admin,
    projection: projection.data
      ? {
          projectedPpg: Number(projection.data.projected_ppg),
          priorSeasonPpg: projection.data.prior_season_ppg === null ? null : Number(projection.data.prior_season_ppg),
          source: projection.data.projection_source,
        }
      : null,
    weeks,
    log: logRows,
    possibleMatches: [...matches].map(([cfbdId, name]) => ({ cfbdId, name })),
  };
}
