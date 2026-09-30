/** Which week the lineup builder shows, and when the next one opens. Pure, for testing. */

export type WeekGame = { week: number; kickoff_at: string };

/** A week that isn't priced yet; `opensAt` is null when prices are due any time now. */
export type UpcomingWeek = { week: number; opensAt: string | null };

export type LineupWeek =
  /** Priced, with at least one game still to kick off: lineups can change. */
  | { kind: "open"; week: number }
  /** Priced, every game has kicked off, and the next week isn't priced yet: read-only. */
  | { kind: "finished"; week: number; next: UpcomingWeek | null }
  /** Nothing priced yet this season. */
  | { kind: "none"; next: UpcomingWeek | null };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The earliest priced week that still has a game to kick off. Once a week's
 * last game has kicked off, that week stays on show (read-only) until the
 * next week is priced on Tuesday.
 */
export function pickLineupWeek(
  games: WeekGame[],
  pricedWeeks: ReadonlySet<number>,
  now: Date,
  firstWeek: number,
): LineupWeek {
  const weeks = [...new Set(games.map((g) => g.week))].filter((w) => w >= firstWeek).sort((a, b) => a - b);
  const hasGameToCome = (week: number) =>
    games.some((g) => g.week === week && new Date(g.kickoff_at).getTime() > now.getTime());

  const open = weeks.find((w) => pricedWeeks.has(w) && hasGameToCome(w));
  if (open !== undefined) return { kind: "open", week: open };

  const finished = weeks.filter((w) => pricedWeeks.has(w) && !hasGameToCome(w)).at(-1);
  const upcoming = weeks.find((w) => (finished === undefined || w > finished) && hasGameToCome(w));
  const next = upcoming === undefined ? null : { week: upcoming, opensAt: nextPricingRun(now) };
  return finished === undefined ? { kind: "none", next } : { kind: "finished", week: finished, next };
}

/**
 * When generate-salaries next runs: Tuesdays at 12:00 UTC (vercel.json).
 * Null for the day after a run, while the week's prices are due any time
 * (on Vercel's free plan a job runs some time within its hour).
 */
export function nextPricingRun(now: Date): string | null {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  next.setUTCDate(next.getUTCDate() + ((2 - next.getUTCDay() + 7) % 7)); // 2 = Tuesday
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 7);
  const previous = next.getTime() - 7 * DAY_MS;
  if (now.getTime() - previous < DAY_MS) return null;
  return next.toISOString();
}
