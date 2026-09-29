import type { Position, PricingSettings } from "@/lib/pricing/settings";

/** The parts of a player_game_stats row that measure a player's role. */
export type UsageRow = {
  player_id: number;
  game_id: number;
  week: number;
  team: string;
  pass_att: number;
  rush_att: number;
  receptions: number;
};

/** The work that shows who starts: pass attempts for QBs, carries for RBs, catches for WRs and TEs. */
function work(row: UsageRow, position: Position): number {
  if (position === "QB") return Number(row.pass_att);
  if (position === "RB") return Number(row.rush_att);
  return Number(row.receptions);
}

/**
 * Starter share (PRD 2.5) for each player in `players`: their share of their
 * position group's work over their team's last `window_games` games, divided
 * by that position's `full_share` and capped at 1. A missed game counts as no
 * work, so injured players and backups score low. Players whose team hasn't
 * played yet, or whose position group did no work in the window, get 1.
 *
 * `rows` are this season's stat lines before the week being priced;
 * `positionOf` gives the position of every player in the players table.
 */
export function starterShares(
  rows: UsageRow[],
  players: { id: number; position: Position; team: string }[],
  positionOf: Map<number, Position>,
  settings: PricingSettings["starter_share"],
): Map<number, number> {
  // Each team's most recent games.
  const gameWeeks = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const games = gameWeeks.get(row.team) ?? new Map<number, number>();
    games.set(row.game_id, row.week);
    gameWeeks.set(row.team, games);
  }
  const recent = new Map<string, Set<number>>();
  for (const [team, games] of gameWeeks) {
    const latest = [...games].sort((a, b) => b[1] - a[1]).slice(0, settings.window_games);
    recent.set(team, new Set(latest.map(([gameId]) => gameId)));
  }

  // Work per player and per team position group, over those games.
  const playerWork = new Map<string, number>();
  const groupWork = new Map<string, number>();
  for (const row of rows) {
    const position = positionOf.get(row.player_id);
    if (!position || !recent.get(row.team)?.has(row.game_id)) continue;
    const amount = work(row, position);
    const key = `${row.team}:${position}`;
    groupWork.set(key, (groupWork.get(key) ?? 0) + amount);
    // Keyed by team too: only work for the player's current team counts.
    const mine = `${row.player_id}:${row.team}`;
    playerWork.set(mine, (playerWork.get(mine) ?? 0) + amount);
  }

  const shares = new Map<number, number>();
  for (const p of players) {
    const group = groupWork.get(`${p.team}:${p.position}`) ?? 0;
    if (!recent.has(p.team) || group <= 0) {
      shares.set(p.id, 1);
      continue;
    }
    const mine = playerWork.get(`${p.id}:${p.team}`) ?? 0;
    shares.set(p.id, Math.min(1, mine / group / settings.full_share[p.position]));
  }
  return shares;
}
