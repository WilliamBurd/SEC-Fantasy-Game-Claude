import { describe, expect, it } from "vitest";

import { nextPricingRun, pickLineupWeek, type WeekGame } from "./week";

const games: WeekGame[] = [
  { week: 2, kickoff_at: "2026-09-12T19:30:00Z" },
  { week: 4, kickoff_at: "2026-09-26T16:00:00Z" },
  { week: 5, kickoff_at: "2026-10-01T23:30:00Z" }, // Thursday night
  { week: 5, kickoff_at: "2026-10-03T16:00:00Z" },
  { week: 5, kickoff_at: "2026-10-03T23:00:00Z" },
  { week: 6, kickoff_at: "2026-10-10T16:00:00Z" },
  { week: 7, kickoff_at: "2026-10-17T16:00:00Z" },
];

const wednesday = new Date("2026-09-30T15:00:00Z");
const saturdayAfternoon = new Date("2026-10-03T18:00:00Z");
const saturdayNight = new Date("2026-10-04T01:00:00Z");

describe("pickLineupWeek", () => {
  it("shows the earliest priced week with a game still to come", () => {
    expect(pickLineupWeek(games, new Set([4, 5]), wednesday, 3)).toEqual({ kind: "open", week: 5 });
    expect(pickLineupWeek(games, new Set([5, 6]), wednesday, 3)).toEqual({ kind: "open", week: 5 });
  });

  it("keeps a week open while any of its games is still to kick off", () => {
    expect(pickLineupWeek(games, new Set([5]), saturdayAfternoon, 3)).toEqual({ kind: "open", week: 5 });
  });

  it("shows the finished week read-only until the next is priced", () => {
    expect(pickLineupWeek(games, new Set([4, 5]), saturdayNight, 3)).toEqual({
      kind: "finished",
      week: 5,
      next: { week: 6, opensAt: "2026-10-06T12:00:00.000Z" },
    });
    expect(pickLineupWeek(games, new Set([4, 5, 6]), saturdayNight, 3)).toEqual({ kind: "open", week: 6 });
  });

  it("says the season is over after the last week", () => {
    expect(pickLineupWeek(games, new Set([7]), new Date("2026-12-01T00:00:00Z"), 3)).toEqual({
      kind: "finished",
      week: 7,
      next: null,
    });
  });

  it("handles nothing priced yet, and ignores weeks before the contest starts", () => {
    expect(pickLineupWeek(games, new Set([2]), new Date("2026-09-01T00:00:00Z"), 3)).toEqual({
      kind: "none",
      next: { week: 4, opensAt: "2026-09-01T12:00:00.000Z" },
    });
    expect(pickLineupWeek([], new Set(), wednesday, 3)).toEqual({ kind: "none", next: null });
  });
});

describe("nextPricingRun", () => {
  it("is the next Tuesday at 12:00 UTC", () => {
    expect(nextPricingRun(saturdayNight)).toBe("2026-10-06T12:00:00.000Z");
    expect(nextPricingRun(new Date("2026-10-06T11:00:00Z"))).toBe("2026-10-06T12:00:00.000Z");
    expect(nextPricingRun(new Date("2026-10-07T13:00:00Z"))).toBe("2026-10-13T12:00:00.000Z");
  });

  it("is null for a day after a run, while prices are due", () => {
    expect(nextPricingRun(new Date("2026-10-06T12:30:00Z"))).toBeNull();
    expect(nextPricingRun(new Date("2026-10-07T11:00:00Z"))).toBeNull();
  });
});
