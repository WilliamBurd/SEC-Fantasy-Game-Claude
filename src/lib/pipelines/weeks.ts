/** Picks which week a job works on when none is given. Pure, for testing. */

export type ScheduledGame = { week: number; kickoff_at: string; status: string };

/** Salary generation: the earliest week at or after `firstWeek` none of whose games has kicked off. */
export function nextUnstartedWeek(games: ScheduledGame[], now: Date, firstWeek: number): number | null {
  const weeks = [...new Set(games.map((g) => g.week))].filter((w) => w >= firstWeek).sort((a, b) => a - b);
  return (
    weeks.find((week) => games.filter((g) => g.week === week).every((g) => new Date(g.kickoff_at) > now)) ?? null
  );
}

/** Live scoring: weeks with a game that has kicked off and isn't final. */
export function liveWeeks(games: ScheduledGame[], now: Date): number[] {
  return [
    ...new Set(games.filter((g) => new Date(g.kickoff_at) <= now && g.status !== "final").map((g) => g.week)),
  ].sort((a, b) => a - b);
}

/** Reconciliation: the latest week with a game that has kicked off. */
export function latestStartedWeek(games: ScheduledGame[], now: Date): number | null {
  const started = games.filter((g) => new Date(g.kickoff_at) <= now).map((g) => g.week);
  return started.length > 0 ? Math.max(...started) : null;
}
