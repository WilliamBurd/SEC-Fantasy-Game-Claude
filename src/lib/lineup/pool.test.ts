import { describe, expect, it } from "vitest";

import { poolPlayer } from "./fixtures";
import { DEFAULT_FILTERS, filterPool, normalize, teamsInPool, type PoolFilters } from "./pool";

const now = new Date("2026-10-03T17:00:00Z");
const players = [
  poolPlayer(1, "QB", 28, { name: "Arch Manning", team: "Texas", blendedPpg: 22.5 }),
  poolPlayer(2, "RB", 12, { name: "José Ruiz", team: "LSU", blendedPpg: 9 }),
  poolPlayer(3, "WR", 12, { name: "Ryan Williams", team: "Alabama", blendedPpg: 14, kickoffAt: "2026-10-03T16:00:00Z", weekPoints: 18.4 }),
  poolPlayer(4, "TE", 5, { name: "Backup Tightend", team: "Texas", blendedPpg: 0 }),
  poolPlayer(5, "WR", 5, { name: "Walk On", team: "LSU", blendedPpg: null }),
  poolPlayer(6, "RB", 5, { name: "Cheap Back", team: "Alabama", blendedPpg: 3 }),
];

const ids = (filters: Partial<PoolFilters>, options?: { lockedLast?: boolean }) =>
  filterPool(players, { ...DEFAULT_FILTERS, ...filters }, now, options).map((p) => p.id);

describe("filterPool", () => {
  it("hides players with no points by default, most expensive first", () => {
    expect(ids({})).toEqual([1, 3, 2, 6]);
    expect(ids({ hideNoPoints: false })).toEqual([1, 3, 2, 6, 4, 5]);
  });

  it("filters by position, with FLEX meaning RB, WR or TE", () => {
    expect(ids({ position: "RB" })).toEqual([2, 6]);
    expect(ids({ position: "FLEX", hideNoPoints: false })).toEqual([3, 2, 6, 4, 5]);
  });

  it("filters by team, max salary and search", () => {
    expect(ids({ team: "LSU", hideNoPoints: false })).toEqual([2, 5]);
    expect(ids({ maxSalary: 12 })).toEqual([3, 2, 6]);
    expect(ids({ search: "jose" })).toEqual([2]);
    expect(ids({ search: "  ALA " })).toEqual([3, 6]);
  });

  it("sorts", () => {
    expect(ids({ sort: "salary_asc" })).toEqual([6, 3, 2, 1]);
    expect(ids({ sort: "ppg" })).toEqual([1, 3, 2, 6]);
    expect(ids({ sort: "value" })).toEqual([3, 1, 2, 6]);
    expect(ids({ sort: "points" })).toEqual([3, 1, 2, 6]);
    expect(ids({ sort: "name" })).toEqual([1, 6, 2, 3]);
  });

  it("can put locked players last", () => {
    expect(ids({}, { lockedLast: true })).toEqual([1, 2, 6, 3]);
  });

  it("keeps players who scored this week even with no Blended PPG", () => {
    const scored = [poolPlayer(7, "WR", 5, { blendedPpg: 0, weekPoints: 6 })];
    expect(filterPool(scored, DEFAULT_FILTERS, now)).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("normalizes names for search", () => {
    expect(normalize(" José ")).toBe("jose");
  });

  it("lists teams in the pool", () => {
    expect(teamsInPool(players)).toEqual(["Alabama", "LSU", "Texas"]);
  });
});
