import "server-only";

import { check, type Db } from "@/lib/pipelines/db";
import { seasonFor } from "@/lib/pipelines/season";

import { exactIlike, rosterSlots, type RosterPlayer, type RosterSlot } from "./view";

export type RosterPage = {
  userId: string;
  username: string;
  isOwner: boolean;
  season: number;
  seasonScore: number;
  rank: { rank: number; total: number } | null;
  /** Weeks they saved a lineup for, in order. */
  weeks: number[];
  week: number | null;
  weekScore: number;
  /** Some of the week's games haven't kicked off yet. */
  weekLive: boolean;
  slots: RosterSlot[];
};

const SLOT_COLUMNS = "week, total_score, qb_id, rb1_id, rb2_id, wr1_id, wr2_id, te_id, flex_id";

type LineupRow = {
  week: number;
  total_score: number | string;
  qb_id: number | null;
  rb1_id: number | null;
  rb2_id: number | null;
  wr1_id: number | null;
  wr2_id: number | null;
  te_id: number | null;
  flex_id: number | null;
};

type StatRow = {
  player_id: number;
  fantasy_points: number | string | null;
  players: { first_name: string; last_name: string; team: string; position: string };
  games: { home_team: string; away_team: string; kickoff_at: string };
};

/**
 * One user's season for their roster page, read as the viewer. Someone
 * else's lineups come from public_lineups, so picks stay hidden until each
 * player's game kicks off; the owner reads their own lineups in full.
 */
export async function loadRosterPage(
  db: Db,
  username: string,
  viewerId: string,
  requestedWeek: unknown,
  now: Date,
): Promise<RosterPage | null> {
  const { data: profile, error } = await db
    .from("profiles")
    .select("id, username")
    .ilike("username", exactIlike(username))
    .maybeSingle();
  check(error, "load profile");
  if (!profile) return null;

  const season = seasonFor(now);
  const isOwner = profile.id === viewerId;
  const [lineups, rankRow, rankCount] = await Promise.all([
    db
      .from(isOwner ? "lineups" : "public_lineups")
      .select(SLOT_COLUMNS)
      .eq("user_id", profile.id)
      .eq("season", season)
      .order("week")
      .overrideTypes<LineupRow[], { merge: false }>(),
    db.rpc("leaderboard", { p_season: season, p_week: 0 }).eq("user_id", profile.id).maybeSingle(),
    db.rpc("leaderboard", { p_season: season, p_week: 0 }, { count: "exact", head: true }),
  ]);
  check(lineups.error, "load lineups");
  check(rankRow.error, "load rank");
  check(rankCount.error, "count leaderboard");

  const rows = lineups.data ?? [];
  const weeks = rows.map((r) => r.week);
  const asked = typeof requestedWeek === "string" && /^\d+$/.test(requestedWeek) ? Number(requestedWeek) : null;
  const week = asked !== null && weeks.includes(asked) ? asked : (weeks.at(-1) ?? null);
  const row = rows.find((r) => r.week === week) ?? null;
  const seasonScore = rows.reduce((sum, r) => sum + Number(r.total_score), 0);
  const rank = rankRow.data
    ? { rank: Number((rankRow.data as { season_rank: number }).season_rank), total: rankCount.count ?? 0 }
    : null;

  let slots: RosterSlot[] = [];
  let weekLive = false;
  if (week !== null) {
    const ids = row
      ? [row.qb_id, row.rb1_id, row.rb2_id, row.wr1_id, row.wr2_id, row.te_id, row.flex_id].filter((id): id is number => id !== null)
      : [];
    const [stats, games] = await Promise.all([
      ids.length
        ? db
            .from("player_weekly_stats")
            .select(
              "player_id, fantasy_points, players!inner(first_name, last_name, team, position), games!inner(home_team, away_team, kickoff_at)",
            )
            .eq("season", season)
            .eq("week", week)
            .in("player_id", ids)
            .overrideTypes<StatRow[], { merge: false }>()
        : Promise.resolve({ data: [] as StatRow[], error: null }),
      db.from("games").select("kickoff_at").eq("season", season).eq("week", week),
    ]);
    check(stats.error, "load roster players");
    check(games.error, "load week games");
    weekLive = (games.data ?? []).some((g) => new Date(g.kickoff_at).getTime() > now.getTime());

    const players = new Map<number, RosterPlayer>(
      (stats.data ?? []).map((s) => {
        const home = s.games.home_team === s.players.team;
        return [
          s.player_id,
          {
            id: s.player_id,
            name: `${s.players.first_name} ${s.players.last_name}`,
            position: s.players.position,
            team: s.players.team,
            opponent: home ? s.games.away_team : s.games.home_team,
            home,
            kickoffAt: s.games.kickoff_at,
            points: Number(s.fantasy_points ?? 0),
          },
        ];
      }),
    );
    slots = rosterSlots(row, players, { isOwner, weekOver: !weekLive, now });
  }

  return {
    userId: profile.id,
    username: profile.username,
    isOwner,
    season,
    seasonScore,
    rank,
    weeks,
    week,
    weekScore: Number(row?.total_score ?? 0),
    weekLive,
    slots,
  };
}
