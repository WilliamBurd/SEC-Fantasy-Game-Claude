import type { JobContext } from "./context";
import { check, loadSettings } from "./db";
import { preseasonSetup, weeklyRosterCheck } from "./preseason";
import { generateSalaries } from "./salaries";
import { scoreWeek } from "./scoring";
import { seasonFor } from "./season";
import { latestStartedWeek, liveWeeks, nextUnstartedWeek, type ScheduledGame } from "./weeks";

export const JOB_NAMES = [
  "preseason-setup",
  "roster-check",
  "generate-salaries",
  "score-games",
  "reconcile-week",
] as const;
export type JobName = (typeof JOB_NAMES)[number];

export function isJobName(value: string): value is JobName {
  return (JOB_NAMES as readonly string[]).includes(value);
}

async function loadSchedule(ctx: JobContext, season: number): Promise<ScheduledGame[]> {
  const { data, error } = await ctx.db.from("games").select("week, kickoff_at, status").eq("season", season);
  check(error, "load schedule");
  return (data ?? []) as ScheduledGame[];
}

/**
 * Runs one pipeline. `season` defaults to the current season; `week`
 * defaults to the week the job naturally works on:
 * - generate-salaries: the next week whose games haven't started
 * - score-games: every week with a game in progress
 * - reconcile-week: the most recent week that has started
 */
export async function runJob(ctx: JobContext, job: JobName, options: { season?: number; week?: number } = {}) {
  const season = options.season ?? seasonFor(ctx.now);

  switch (job) {
    case "preseason-setup":
      return preseasonSetup(ctx, season);

    case "roster-check":
      return weeklyRosterCheck(ctx, season);

    case "generate-salaries": {
      const { season: seasonSettings } = await loadSettings(ctx.db);
      const week =
        options.week ?? nextUnstartedWeek(await loadSchedule(ctx, season), ctx.now, seasonSettings.first_contest_week);
      if (week === null) return { status: "skipped", season, reason: "No upcoming week to price." };
      return generateSalaries(ctx, season, week);
    }

    case "score-games": {
      const weeks = options.week !== undefined ? [options.week] : liveWeeks(await loadSchedule(ctx, season), ctx.now);
      if (weeks.length === 0) return { status: "idle", season, reason: "No SEC-vs-SEC game is in progress." };
      const runs = [];
      for (const week of weeks) runs.push(await scoreWeek(ctx, season, week, "live"));
      return { season, runs };
    }

    case "reconcile-week": {
      const week = options.week ?? latestStartedWeek(await loadSchedule(ctx, season), ctx.now);
      if (week === null) return { status: "skipped", season, reason: "No week has started yet." };
      return scoreWeek(ctx, season, week, "reconcile");
    }
  }
}
