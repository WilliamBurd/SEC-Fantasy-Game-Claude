/** What the admin screen says about each scheduled job. */

import type { JobName } from "@/lib/pipelines/jobs";

export type JobInfo = {
  label: string;
  description: string;
  schedule: string;
  /** Whether the admin can pick a week (blank = the job's usual week). */
  takesWeek: boolean;
  weekHint?: string;
  /** Shown before running, for jobs with a big effect. */
  caution?: string;
};

export const JOB_INFO: Record<JobName, JobInfo> = {
  "roster-check": {
    label: "Roster check",
    description: "Reads every SEC roster from CFBD: adds new players, moves transfers, deactivates players who left, and flags matches for hand-added players.",
    schedule: "Tuesdays, 10:00 UTC",
    takesWeek: false,
  },
  "generate-salaries": {
    label: "Set prices",
    description: "Prices the week's player pool. Keeps salary overrides. Refuses once any of that week's games has kicked off.",
    schedule: "Tuesdays, 12:00 UTC",
    takesWeek: true,
    weekHint: "Blank: the next week that hasn't started",
  },
  "score-games": {
    label: "Score live games",
    description: "Pulls box scores for games in progress and updates points and lineup totals.",
    schedule: "Not scheduled yet (Phase 7)",
    takesWeek: true,
    weekHint: "Blank: every week with a game in progress",
  },
  "reconcile-week": {
    label: "Final scores",
    description: "Pulls the final box scores for a week, updates points and lineup totals, and marks games final.",
    schedule: "Mondays, 12:00 UTC",
    takesWeek: true,
    weekHint: "Blank: the latest week that has started",
  },
  "injury-report": {
    label: "Injury report",
    description: "Reads the Covers injury page and updates injury tags. Keeps your own injury edits.",
    schedule: "Daily, 13:00 UTC (acts Wednesday to game day)",
    takesWeek: false,
  },
  "preseason-setup": {
    label: "Pre-season setup",
    description: "Loads the season's schedule, rosters, recruiting stars, last season's stats and automatic projections.",
    schedule: "Once a season",
    takesWeek: false,
    caution: "Uses about 39 of the month's ~1,000 CFBD calls and can take a few minutes. It keeps projections you set by hand. Only needed once a season.",
  },
};

/** The order the admin screen lists them in. */
export const JOB_ORDER: JobName[] = [
  "roster-check",
  "generate-salaries",
  "reconcile-week",
  "score-games",
  "injury-report",
  "preseason-setup",
];
