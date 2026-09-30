import { describe, expect, it } from "vitest";

import type { CfbdRosterPlayer } from "@/lib/cfbd/types";

import { diffRosters, nameKey, type PlayerRow } from "./roster-diff";

const roster = (id: string, team: string, position: string | null, year = 2): CfbdRosterPlayer => ({
  id,
  firstName: `First${id}`,
  lastName: `Last${id}`,
  team,
  year,
  position,
  recruitIds: null,
});

const row = (id: number, team: string, overrides: Partial<PlayerRow> = {}): PlayerRow => ({
  id,
  first_name: `First${id}`,
  last_name: `Last${id}`,
  team,
  position: "WR",
  class_year: 2,
  active: true,
  source: "cfbd",
  deactivated_by_admin: false,
  ...overrides,
});

describe("diffRosters", () => {
  const existing = [
    row(1, "Georgia"),
    row(2, "Alabama"),
    row(3, "LSU"),
    row(4, "Texas", { active: false }),
    row(-1, "Auburn", { source: "admin", position: "RB" }),
    row(5, "Florida", { active: false, deactivated_by_admin: true }),
    row(-2, "Ole Miss", { source: "admin", first_name: "First11", last_name: "Last11 Jr." }),
  ];
  const rosters = [
    roster("1", "Georgia", "WR"),
    roster("2", "Texas A&M", "WR"), // transferred within the SEC
    roster("10", "Ole Miss", "QB", 1), // new freshman
    roster("11", "Ole Miss", "FB"), // fullback, scored as RB
    roster("12", "Ole Miss", "LB"), // not a fantasy position
    roster("4", "Texas", "WR"), // back on a roster
    roster("5", "Florida", "WR"), // on a roster, but an admin deactivated them
  ];
  const changes = diffRosters(existing, rosters);

  it("adds new fantasy-position players", () => {
    expect(changes.added.map((p) => [p.id, p.position, p.class_year])).toEqual([
      [10, "QB", 1],
      [11, "RB", 2],
    ]);
  });

  it("refreshes and reactivates players seen on a roster", () => {
    expect(changes.seen.map((p) => [p.id, p.team, p.active])).toEqual([
      [1, "Georgia", true],
      [2, "Texas A&M", true],
      [4, "Texas", true],
      [5, "Florida", false],
    ]);
  });

  it("reports team changes", () => {
    expect(changes.teamChanged).toEqual([{ id: 2, from: "Alabama", to: "Texas A&M" }]);
  });

  it("deactivates CFBD players on no roster, but not admin-added or already inactive ones", () => {
    expect(changes.deactivated).toEqual([3]);
  });

  it("flags new CFBD players who match a temporary player by name and team", () => {
    expect(changes.possibleMatches).toEqual([{ temporaryId: -2, cfbdId: 11, name: "First11 Last11", team: "Ole Miss" }]);
  });
});

describe("nameKey", () => {
  it("ignores case, accents, punctuation and suffixes", () => {
    expect(nameKey("José", "Ruiz Jr.")).toBe(nameKey("jose", "ruiz"));
    expect(nameKey("Anthony", "Evans III")).toBe("anthonyevans");
    expect(nameKey("DJ", "Miller")).not.toBe(nameKey("D.J.", "Millers"));
  });
});
