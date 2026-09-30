import { describe, expect, it } from "vitest";

import { firstKickoff, isWeekLive, pickBoardWeek, pickView, startedWeeks, type BoardGame } from "./weeks";

const games: BoardGame[] = [
  { week: 2, kickoff_at: "2026-09-12T19:30:00Z", status: "final" },
  { week: 3, kickoff_at: "2026-09-19T16:00:00Z", status: "final" },
  { week: 5, kickoff_at: "2026-10-03T16:00:00Z", status: "in_progress" },
  { week: 5, kickoff_at: "2026-10-03T23:00:00Z", status: "scheduled" },
  { week: 6, kickoff_at: "2026-10-10T16:00:00Z", status: "scheduled" },
];
const saturday = new Date("2026-10-03T18:00:00Z");

describe("startedWeeks", () => {
  it("lists contest weeks with a game that has kicked off", () => {
    expect(startedWeeks(games, saturday, 3)).toEqual([3, 5]);
    expect(startedWeeks(games, new Date("2026-09-01T00:00:00Z"), 3)).toEqual([]);
  });
});

describe("pickBoardWeek", () => {
  it("uses the requested week when it has started, else the latest", () => {
    expect(pickBoardWeek([3, 5], "3")).toBe(3);
    expect(pickBoardWeek([3, 5], "6")).toBe(5);
    expect(pickBoardWeek([3, 5], "abc")).toBe(5);
    expect(pickBoardWeek([3, 5], undefined)).toBe(5);
    expect(pickBoardWeek([], "3")).toBeNull();
  });
});

describe("pickView", () => {
  it("defaults to the season table", () => {
    expect(pickView("week")).toBe("week");
    expect(pickView("season")).toBe("season");
    expect(pickView(undefined)).toBe("season");
  });
});

describe("isWeekLive", () => {
  it("is live while a game has kicked off in the last few hours and isn't final", () => {
    expect(isWeekLive(games, 5, saturday)).toBe(true);
    expect(isWeekLive(games, 5, new Date("2026-10-03T12:00:00Z"))).toBe(false); // before kickoff
    expect(isWeekLive(games, 5, new Date("2026-10-04T12:00:00Z"))).toBe(false); // long over
    expect(isWeekLive(games, 3, new Date("2026-09-19T17:00:00Z"))).toBe(false); // final
  });
});

describe("firstKickoff", () => {
  it("finds the next contest game", () => {
    expect(firstKickoff(games, 3, new Date("2026-09-01T00:00:00Z"))).toEqual({ week: 3, kickoffAt: "2026-09-19T16:00:00Z" });
    expect(firstKickoff(games, 3, new Date("2026-09-30T00:00:00Z"))).toEqual({ week: 5, kickoffAt: "2026-10-03T16:00:00Z" });
    expect(firstKickoff(games, 7, new Date("2026-09-01T00:00:00Z"))).toBeNull();
  });
});
