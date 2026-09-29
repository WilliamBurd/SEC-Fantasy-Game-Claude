import { describe, expect, it } from "vitest";

import { blendedPpg, mostExpensiveLineup, priceWeek, type PricingInput } from "./engine";
import { autoProjection } from "./projection";
import { DEFAULT_PRICING_SETTINGS as settings, withDefaults, type Position } from "./settings";

let nextId = 1;
function player(position: Position, ppg: number, overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    playerId: nextId++,
    position,
    team: "Georgia",
    priorSeasonPpg: ppg,
    projectedPpg: ppg,
    currentSeasonPpg: null,
    gamesPlayed: 0,
    previousSalary: null,
    ...overrides,
  };
}

describe("blendedPpg", () => {
  it("uses 60% last season and 40% projection before any games", () => {
    expect(blendedPpg(player("WR", 0, { priorSeasonPpg: 20, projectedPpg: 10 }), settings)).toBeCloseTo(16);
  });

  it("uses only the projection for players with no college stats", () => {
    expect(blendedPpg(player("RB", 0, { priorSeasonPpg: null, projectedPpg: 7 }), settings)).toBeCloseTo(7);
  });

  it("weights this season 50% after 3 games and 75% after 9", () => {
    const base = { priorSeasonPpg: 20, projectedPpg: 10, currentSeasonPpg: 26 };
    // baseline 16; 0.5 * 26 + 0.5 * 16 = 21
    expect(blendedPpg(player("QB", 0, { ...base, gamesPlayed: 3 }), settings)).toBeCloseTo(21);
    // 0.75 * 26 + 0.25 * 16 = 23.5
    expect(blendedPpg(player("QB", 0, { ...base, gamesPlayed: 9 }), settings)).toBeCloseTo(23.5);
  });

  it("blends a freshman's projection with this season", () => {
    // 0.5 * 12 + 0.5 * 4 = 8
    const freshman = player("WR", 0, { priorSeasonPpg: null, projectedPpg: 4, currentSeasonPpg: 12, gamesPlayed: 3 });
    expect(blendedPpg(freshman, settings)).toBeCloseTo(8);
  });
});

// The example week from the pricing discussion: 8 teams in the pool.
function exampleWeek() {
  const teams = ["Alabama", "Georgia", "LSU", "Texas", "Ole Miss", "Tennessee", "Auburn", "Florida"];
  const pool: PricingInput[] = [];
  const add = (position: Position, ppgs: number[]) =>
    ppgs.forEach((ppg, i) => pool.push(player(position, ppg, { team: teams[i % teams.length] })));

  // 8 starting QBs from 26 down, then backups; the 9th QB (fringe) is at 4.
  add("QB", [26, 22, 20, 18, 16, 15, 14, 12, 4, 2, 1]);
  // 16 starting RBs, then the 17th (fringe) at 3.
  add("RB", [18, 16, 15, 14, 13, 12, 11, 10, 10, 9, 9, 9, 8, 8, 7, 7, 3, 2, 1]);
  // 24 starting WRs, then the 25th (fringe) at 3.
  add("WR", [21, 18, 16, 15, 14, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 2]);
  // 8 starting TEs, then the 9th (fringe) at 2.
  add("TE", [12, 10, 9, 8, 7, 6, 5, 4, 2, 1]);
  return pool;
}

describe("priceWeek", () => {
  const pool = exampleWeek();
  const result = priceWeek(pool, settings);
  const salaryOf = (position: Position, ppg: number) =>
    result.players.find((p) => p.position === position && p.blendedPpg === ppg)!.salary;

  it("finds the fringe level at depth × teams + 1 for each position", () => {
    expect(result.teamsInPool).toBe(8);
    expect(result.fringeLevel).toEqual({ QB: 4, RB: 3, WR: 3, TE: 2 });
  });

  it("scales prices so the most expensive possible lineup costs the target", () => {
    // Top lineup values: QB 22 + RB 15, 13 + WR 18, 15 + TE 10 + FLEX (WR) 13 = 106.
    // k = (145 − 7 × 5) / 106 ≈ 1.04 credits per point.
    expect(result.creditsPerPoint).toBeCloseTo(110 / 106, 2);
    expect(result.budgetCheck).toEqual({ topLineupCost: 145, target: 145 });
  });

  it("matches the worked example", () => {
    expect(salaryOf("QB", 26)).toBe(28); // 5 + 22 × 1.04
    expect(salaryOf("WR", 21)).toBe(24); // 5 + 18 × 1.04
    expect(salaryOf("WR", 12)).toBe(14); // 5 + 9 × 1.04
    expect(salaryOf("RB", 9)).toBe(11); // 5 + 6 × 1.04
    expect(salaryOf("QB", 4)).toBe(5); // fringe
    expect(salaryOf("WR", 2)).toBe(5); // below fringe
  });

  it("uses one price per point of value across positions", () => {
    // WR 12 (value 9) and TE 11 would match; TE 12 (value 10) costs one more than WR 12.
    expect(salaryOf("TE", 12) - salaryOf("WR", 12)).toBe(1);
    // RB 9 and WR 9 both have value 6.
    expect(salaryOf("RB", 9)).toBe(salaryOf("WR", 9));
  });

  it("lets both lineup styles fit under the cap", () => {
    // Three stars plus four fringe players.
    const starsAndScrubs = salaryOf("QB", 26) + salaryOf("WR", 21) + salaryOf("RB", 18) + 4 * 5;
    // One star plus six lower-level starters (~9 ppg; TE ~7).
    const oneStar = salaryOf("QB", 26) + 3 * salaryOf("RB", 9) + 2 * salaryOf("WR", 9) + salaryOf("TE", 7);
    // Two stars plus five lower-level starters (~7 ppg; TE ~5).
    const twoStars =
      salaryOf("QB", 26) + salaryOf("WR", 21) + 2 * salaryOf("RB", 7) + 2 * salaryOf("WR", 7) + salaryOf("TE", 5);
    expect([starsAndScrubs, oneStar, twoStars]).toEqual([93, 93, 96]);
    // Four stars don't fit.
    expect(salaryOf("QB", 26) + salaryOf("WR", 21) + salaryOf("RB", 18) + salaryOf("RB", 16) + 3 * 5).toBeGreaterThan(100);
  });

  it("limits the weekly price change", () => {
    const riser = player("WR", 21, { team: "Alabama", previousSalary: 12 });
    const faller = player("WR", 3, { team: "Alabama", previousSalary: 20 });
    const priced = priceWeek([...exampleWeek(), riser, faller], settings);
    expect(priced.players.find((p) => p.playerId === riser.playerId)!.salary).toBe(16);
    expect(priced.players.find((p) => p.playerId === faller.playerId)!.salary).toBe(16);
  });

  it("prices everyone at the min when no one has value", () => {
    const flat = priceWeek([player("QB", 5), player("QB", 5)], settings);
    expect(flat.players.map((p) => p.salary)).toEqual([5, 5]);
  });
});

describe("mostExpensiveLineup", () => {
  it("fills QB, 2 RB, 2 WR, TE, then the priciest remaining RB/WR/TE as FLEX", () => {
    const priced = [
      { playerId: 1, position: "QB" as const, salary: 30 },
      { playerId: 2, position: "QB" as const, salary: 29 }, // a second QB can't be FLEX
      { playerId: 3, position: "RB" as const, salary: 20 },
      { playerId: 4, position: "RB" as const, salary: 18 },
      { playerId: 5, position: "RB" as const, salary: 17 },
      { playerId: 6, position: "WR" as const, salary: 25 },
      { playerId: 7, position: "WR" as const, salary: 15 },
      { playerId: 8, position: "TE" as const, salary: 12 },
    ];
    expect(mostExpensiveLineup(priced)).toBe(30 + 20 + 18 + 25 + 15 + 12 + 17);
  });
});

describe("autoProjection", () => {
  it("starts returning players from last season", () => {
    expect(autoProjection({ position: "WR", priorSeasonPpg: 11.5, recruitingStars: 3 }, settings)).toBe(11.5);
  });

  it("gives freshmen a baseline by position and stars", () => {
    expect(autoProjection({ position: "QB", priorSeasonPpg: null, recruitingStars: 5 }, settings)).toBe(8);
    expect(autoProjection({ position: "RB", priorSeasonPpg: null, recruitingStars: 4 }, settings)).toBe(4);
    expect(autoProjection({ position: "TE", priorSeasonPpg: null, recruitingStars: null }, settings)).toBe(0.5);
    expect(autoProjection({ position: "WR", priorSeasonPpg: null, recruitingStars: 2 }, settings)).toBe(1);
  });
});

describe("withDefaults", () => {
  it("keeps stored values and fills missing ones", () => {
    const merged = withDefaults(settings, { max_weekly_change: 6, fringe_depth: { WR: 2 } });
    expect(merged.max_weekly_change).toBe(6);
    expect(merged.fringe_depth).toEqual({ QB: 1, RB: 2, WR: 2, TE: 1 });
    expect(merged.min_salary).toBe(5);
  });
});
