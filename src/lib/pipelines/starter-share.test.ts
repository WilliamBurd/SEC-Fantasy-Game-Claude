import { describe, expect, it } from "vitest";

import type { Position } from "@/lib/pricing/settings";

import { starterShares, type UsageRow } from "./starter-share";

const settings = { window_games: 3, full_share: { QB: 0.7, RB: 0.35, WR: 0.2, TE: 0.45 } };

function line(player_id: number, week: number, stats: Partial<UsageRow> = {}, team = "Ole Miss"): UsageRow {
  return { player_id, game_id: week * 100 + (team === "Ole Miss" ? 1 : 2), week, team, pass_att: 0, rush_att: 0, receptions: 0, ...stats };
}

const positions = new Map<number, Position>([
  [1, "QB"], // starter
  [2, "QB"], // backup
  [3, "RB"], // injured after week 1
  [4, "RB"],
  [5, "WR"],
  [6, "WR"],
]);
const pool = (id: number, team = "Ole Miss") => ({ id, position: positions.get(id)!, team });

describe("starterShares", () => {
  it("gives a starting QB 1 and a backup a small share", () => {
    const rows = [1, 2, 3].flatMap((week) => [line(1, week, { pass_att: 36 }), line(2, week, { pass_att: 4 })]);
    const shares = starterShares(rows, [pool(1), pool(2)], positions, settings);
    expect(shares.get(1)).toBe(1);
    // 12 of 120 attempts = 0.1, divided by 0.7
    expect(shares.get(2)).toBeCloseTo(0.1 / 0.7);
  });

  it("counts only the team's last window_games games, so missed games count as no work", () => {
    const rows = [
      line(3, 1, { rush_att: 20 }),
      line(4, 1, { rush_att: 10 }),
      ...[2, 3, 4].map((week) => line(4, week, { rush_att: 25 })),
    ];
    const shares = starterShares(rows, [pool(3), pool(4)], positions, settings);
    // Week 1 is outside the window: player 3 has done nothing in the last 3 games.
    expect(shares.get(3)).toBe(0);
    expect(shares.get(4)).toBe(1);
  });

  it("gives 1 when the team hasn't played or the position group did no work", () => {
    const rows = [line(1, 1, { pass_att: 30 })];
    const shares = starterShares(rows, [pool(5), pool(1, "Auburn")], positions, settings);
    expect(shares.get(5)).toBe(1); // Ole Miss WRs caught nothing
    expect(shares.get(1)).toBe(1); // Auburn has no games in the rows
  });

  it("ignores work done for another team", () => {
    const rows = [
      line(5, 1, { receptions: 9 }, "Texas"),
      line(5, 2, { receptions: 1 }),
      line(6, 2, { receptions: 19 }),
    ];
    const shares = starterShares(rows, [pool(5)], positions, settings);
    // 1 of 20 Ole Miss WR catches = 0.05, divided by 0.2
    expect(shares.get(5)).toBeCloseTo(0.25);
  });
});
