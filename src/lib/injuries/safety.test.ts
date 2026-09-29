import { describe, expect, it } from "vitest";

import type { CoversInjury, CoversTeam } from "./covers";
import type { MatchResult } from "./match";
import { checkInjuryReport } from "./safety";

const injury = (status: CoversInjury["status"] = "out"): CoversInjury => ({
  name: "A. Player",
  position: "WR",
  statusText: "Out",
  status,
  injury: null,
  dateText: null,
  note: null,
});

/** A page with `teams` teams, two injuries each. */
const page = (teams: number, status: CoversInjury["status"] = "out"): CoversTeam[] =>
  Array.from({ length: teams }, (_, i) => ({ team: `Team ${i}`, listedCount: 2, injuries: [injury(status), injury(status)] }));

const match = (secTeams: number, matched: number): MatchResult => ({
  matched: Array.from({ length: matched }, (_, i) => ({ playerId: i, team: "LSU", injury: injury(), by: "name" as const })),
  unmatched: [],
  teamsInReport: Array.from({ length: secTeams }, (_, i) => `SEC ${i}`),
});

describe("checkInjuryReport", () => {
  it("accepts a normal report", () => {
    expect(checkInjuryReport(page(136), match(16, 30), 16, 25)).toEqual({ ok: true });
  });

  it("accepts a report that clears a few entries", () => {
    expect(checkInjuryReport(page(136), match(16, 20), 16, 30)).toEqual({ ok: true });
  });

  it("refuses an empty or error page", () => {
    expect(checkInjuryReport([], match(0, 0), 16, 25)).toMatchObject({ ok: false });
    expect(checkInjuryReport(page(40), match(16, 30), 16, 25)).toMatchObject({ ok: false });
  });

  it("refuses when rows read don't match the page's counts (layout change)", () => {
    const teams = page(136);
    teams[5] = { ...teams[5], injuries: [] };
    const check = checkInjuryReport(teams, match(16, 30), 16, 25);
    expect(check).toMatchObject({ ok: false });
    if (!check.ok) expect(check.reason).toContain("Team 5");
  });

  it("refuses a page that lists nobody", () => {
    const teams = page(136).map((t) => ({ ...t, listedCount: 0, injuries: [] }));
    expect(checkInjuryReport(teams, match(16, 0), 16, 0)).toMatchObject({ ok: false });
  });

  it("refuses when most statuses aren't recognised", () => {
    expect(checkInjuryReport(page(136, null), match(16, 30), 16, 25)).toMatchObject({ ok: false });
  });

  it("refuses when SEC teams are missing", () => {
    expect(checkInjuryReport(page(136), match(8, 30), 16, 25)).toMatchObject({ ok: false });
  });

  it("refuses a sharp drop from the stored report", () => {
    expect(checkInjuryReport(page(136), match(16, 5), 16, 30)).toMatchObject({ ok: false });
    expect(checkInjuryReport(page(136), match(16, 0), 16, 30)).toMatchObject({ ok: false });
  });

  it("allows a drop while few entries are stored", () => {
    expect(checkInjuryReport(page(136), match(16, 0), 16, 4)).toEqual({ ok: true });
  });
});
