import { describe, expect, it } from "vitest";

import { injuryReportDue, latestStartedWeek, liveWeeks, nextUnstartedWeek, type ScheduledGame } from "./weeks";

const now = new Date("2026-10-10T18:00:00Z"); // a Saturday afternoon
const games: ScheduledGame[] = [
  { week: 2, kickoff_at: "2026-09-12T16:00:00Z", status: "final" },
  { week: 5, kickoff_at: "2026-10-03T16:00:00Z", status: "final" },
  { week: 6, kickoff_at: "2026-10-09T23:30:00Z", status: "final" }, // Friday night
  { week: 6, kickoff_at: "2026-10-10T16:00:00Z", status: "in_progress" },
  { week: 6, kickoff_at: "2026-10-10T23:30:00Z", status: "scheduled" },
  { week: 7, kickoff_at: "2026-10-17T16:00:00Z", status: "scheduled" },
  { week: 8, kickoff_at: "2026-10-24T16:00:00Z", status: "scheduled" },
];

describe("nextUnstartedWeek", () => {
  it("skips weeks with any game already kicked off", () => {
    expect(nextUnstartedWeek(games, now, 3)).toBe(7);
  });
  it("never picks a week before the contest starts", () => {
    expect(nextUnstartedWeek(games, new Date("2026-09-01T00:00:00Z"), 3)).toBe(5);
  });
  it("returns null after the last week", () => {
    expect(nextUnstartedWeek(games, new Date("2026-12-01T00:00:00Z"), 3)).toBeNull();
  });
});

describe("liveWeeks", () => {
  it("finds weeks with a kicked-off game that isn't final", () => {
    expect(liveWeeks(games, now)).toEqual([6]);
    expect(liveWeeks(games, new Date("2026-10-14T12:00:00Z"))).toEqual([6]);
    expect(liveWeeks(games, new Date("2026-10-01T12:00:00Z"))).toEqual([]);
  });
});

describe("latestStartedWeek", () => {
  it("finds the most recent week that has begun", () => {
    expect(latestStartedWeek(games, new Date("2026-10-12T12:00:00Z"))).toBe(6);
    expect(latestStartedWeek(games, new Date("2026-08-01T00:00:00Z"))).toBeNull();
  });
});

describe("injuryReportDue", () => {
  it("runs Wednesday to Friday, US Eastern", () => {
    expect(injuryReportDue([], new Date("2026-10-07T13:00:00Z"))).toBe(true); // Wed 9am ET
    expect(injuryReportDue([], new Date("2026-10-09T13:00:00Z"))).toBe(true); // Fri 9am ET
    expect(injuryReportDue([], new Date("2026-10-08T02:00:00Z"))).toBe(true); // Wed 10pm ET, Thu in UTC
  });
  it("runs on the morning of a game day", () => {
    expect(injuryReportDue(games, new Date("2026-10-17T12:00:00Z"))).toBe(true); // Sat, kickoff 16:00Z
  });
  it("doesn't run other days", () => {
    expect(injuryReportDue(games, new Date("2026-10-13T13:00:00Z"))).toBe(false); // Tuesday
    expect(injuryReportDue(games, new Date("2026-10-11T13:00:00Z"))).toBe(false); // Sunday
    expect(injuryReportDue(games, new Date("2026-10-17T17:00:00Z"))).toBe(false); // Sat, after kickoff
    expect(injuryReportDue([], new Date("2026-10-07T03:00:00Z"))).toBe(false); // Tue 11pm ET
  });
});
