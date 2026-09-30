/** Which weeks a leaderboard can show, and whether one is being played. Pure, for testing. */

export type BoardGame = { week: number; kickoff_at: string; status: string };
export type BoardView = "week" | "season";

const LIVE_WINDOW_MS = 5 * 60 * 60 * 1000; // a game is over well within 5 hours

/** Contest weeks with at least one game that has kicked off, in order. */
export function startedWeeks(games: BoardGame[], now: Date, firstWeek: number): number[] {
  const weeks = games
    .filter((g) => g.week >= firstWeek && new Date(g.kickoff_at).getTime() <= now.getTime())
    .map((g) => g.week);
  return [...new Set(weeks)].sort((a, b) => a - b);
}

/** The requested week if it has started, otherwise the latest week that has. */
export function pickBoardWeek(weeks: number[], requested: unknown): number | null {
  const asNumber = typeof requested === "string" && /^\d+$/.test(requested) ? Number(requested) : null;
  if (asNumber !== null && weeks.includes(asNumber)) return asNumber;
  return weeks.at(-1) ?? null;
}

export function pickView(requested: unknown): BoardView {
  return requested === "week" ? "week" : "season";
}

/**
 * A week is live while one of its games has kicked off in the last few hours
 * and isn't marked final: scores can still change, so the page refreshes.
 */
export function isWeekLive(games: BoardGame[], week: number, now: Date): boolean {
  return games.some((g) => {
    const sinceKickoff = now.getTime() - new Date(g.kickoff_at).getTime();
    return g.week === week && g.status !== "final" && sinceKickoff >= 0 && sinceKickoff <= LIVE_WINDOW_MS;
  });
}

/** The next contest kickoff, for "the leaderboard starts when Week N kicks off". */
export function firstKickoff(games: BoardGame[], firstWeek: number, now: Date): { week: number; kickoffAt: string } | null {
  const upcoming = games
    .filter((g) => g.week >= firstWeek && new Date(g.kickoff_at).getTime() > now.getTime())
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))[0];
  return upcoming ? { week: upcoming.week, kickoffAt: upcoming.kickoff_at } : null;
}
