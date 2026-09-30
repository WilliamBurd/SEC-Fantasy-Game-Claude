import { describe, expect, it } from "vitest";

import { describeChange, pickLogFilter, summarizeEdit } from "./change-log";
import { parseCfbdId, parseJobWeek, parsePlayerForm, parsePlayerId, parseProjectionForm, parseSalary } from "./forms";

const TEAMS = ["Alabama", "Georgia", "Texas A&M"];
const form = (values: Record<string, string>) => (name: string) => values[name] ?? null;

describe("parsePlayerForm", () => {
  const good = { firstName: " Kenny ", lastName: "Darby  Jr.", team: "Georgia", position: "WR", classYear: "1", active: "on" };

  it("accepts a new player, with or without a CFBD ID", () => {
    expect(parsePlayerForm(form(good), TEAMS, true)).toEqual({
      ok: true,
      value: { cfbdId: null, firstName: "Kenny", lastName: "Darby Jr.", team: "Georgia", position: "WR", classYear: 1, active: true },
    });
    const withId = parsePlayerForm(form({ ...good, cfbdId: "5123048" }), TEAMS, true);
    expect(withId.ok && withId.value.cfbdId).toBe(5123048);
  });

  it("ignores the CFBD ID when editing, and reads the active box", () => {
    const edited = parsePlayerForm(form({ ...good, cfbdId: "1", active: "" }), TEAMS, false);
    expect(edited.ok && [edited.value.cfbdId, edited.value.active]).toEqual([null, false]);
  });

  it("refuses bad input", () => {
    expect(parsePlayerForm(form({ ...good, firstName: " " }), TEAMS, true).ok).toBe(false);
    expect(parsePlayerForm(form({ ...good, lastName: "x".repeat(41) }), TEAMS, true).ok).toBe(false);
    expect(parsePlayerForm(form({ ...good, team: "Notre Dame" }), TEAMS, true).ok).toBe(false);
    expect(parsePlayerForm(form({ ...good, position: "K" }), TEAMS, true).ok).toBe(false);
    expect(parsePlayerForm(form({ ...good, classYear: "7" }), TEAMS, true).ok).toBe(false);
    expect(parsePlayerForm(form({ ...good, cfbdId: "-4" }), TEAMS, true).ok).toBe(false);
    expect(parsePlayerForm(form({ ...good, cfbdId: "12.5" }), TEAMS, true).ok).toBe(false);
  });
});

describe("parseProjectionForm", () => {
  it("accepts PPG with up to 2 decimals, last season optional", () => {
    expect(parseProjectionForm(form({ projectedPpg: "12.5", priorSeasonPpg: "" }))).toEqual({
      ok: true,
      value: { projectedPpg: 12.5, priorSeasonPpg: null },
    });
    expect(parseProjectionForm(form({ projectedPpg: "0", priorSeasonPpg: "8.25" }))).toEqual({
      ok: true,
      value: { projectedPpg: 0, priorSeasonPpg: 8.25 },
    });
  });

  it("refuses bad numbers", () => {
    expect(parseProjectionForm(form({ projectedPpg: "" })).ok).toBe(false);
    expect(parseProjectionForm(form({ projectedPpg: "61" })).ok).toBe(false);
    expect(parseProjectionForm(form({ projectedPpg: "1.234" })).ok).toBe(false);
    expect(parseProjectionForm(form({ projectedPpg: "-2" })).ok).toBe(false);
    expect(parseProjectionForm(form({ projectedPpg: "5", priorSeasonPpg: "abc" })).ok).toBe(false);
  });
});

describe("small parsers", () => {
  it("salary is 5 to 30", () => {
    expect(parseSalary("5")).toEqual({ ok: true, value: 5 });
    expect(parseSalary(" 30 ")).toEqual({ ok: true, value: 30 });
    expect(parseSalary("4").ok).toBe(false);
    expect(parseSalary("31").ok).toBe(false);
    expect(parseSalary("12.5").ok).toBe(false);
  });

  it("CFBD IDs, player IDs and job weeks", () => {
    expect(parseCfbdId("5079322")).toEqual({ ok: true, value: 5079322 });
    expect(parseCfbdId("0").ok).toBe(false);
    expect(parsePlayerId("-3")).toBe(-3);
    expect(parsePlayerId("4880272")).toBe(4880272);
    expect(parsePlayerId("0")).toBeNull();
    expect(parsePlayerId("abc")).toBeNull();
    expect(parseJobWeek("")).toEqual({ ok: true, value: null });
    expect(parseJobWeek("6")).toEqual({ ok: true, value: 6 });
    expect(parseJobWeek("21").ok).toBe(false);
  });
});

describe("change log wording", () => {
  it("describes job and admin entries", () => {
    expect(describeChange({ action: "pricing_run", details: { week: 5, teamsInPool: 12 }, playerName: null })).toEqual({
      title: "Prices set for week 5",
      detail: "12 teams in the pool",
    });
    expect(
      describeChange({ action: "admin_salary_override", details: { week: 6, salary: 14, previous_salary: 11 }, playerName: "DJ Miller" }),
    ).toEqual({ title: "Salary override for DJ Miller", detail: "Week 6: 11 → 14 credits" });
    expect(
      describeChange({ action: "player_team_changed", details: { from: "Alabama", to: "Texas A&M" }, playerName: "Ryan Williams" }),
    ).toEqual({ title: "Ryan Williams changed teams", detail: "Alabama → Texas A&M" });
    expect(describeChange({ action: "something_new", details: null, playerName: null })).toEqual({
      title: "something new",
      detail: null,
    });
  });

  it("summarizes edits by field", () => {
    expect(summarizeEdit({ team: "Georgia", position: "WR", last_name: "X" }, { team: "Alabama", position: "WR", last_name: "X" })).toBe(
      "team: Georgia → Alabama",
    );
    expect(summarizeEdit(null, {})).toBeNull();
  });

  it("picks a known log filter", () => {
    expect(pickLogFilter("roster")).toBe("roster");
    expect(pickLogFilter("nope")).toBe("all");
  });
});
