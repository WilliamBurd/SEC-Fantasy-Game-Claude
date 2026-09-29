import { describe, expect, it } from "vitest";

import { summarizeGames } from "./stats";

describe("summarizeGames", () => {
  it("averages points per game and counts games", () => {
    const summary = summarizeGames([
      { player_id: 1, fantasy_points: 20 },
      { player_id: 1, fantasy_points: 11.5 },
      { player_id: 1, fantasy_points: 0 },
      { player_id: 2, fantasy_points: 7.25 },
    ]);
    expect(summary.get(1)).toEqual({ ppg: 10.5, games: 3 });
    expect(summary.get(2)).toEqual({ ppg: 7.25, games: 1 });
    expect(summary.get(3)).toBeUndefined();
  });

  it("accepts points returned as strings by the database", () => {
    expect(summarizeGames([{ player_id: 1, fantasy_points: "12.40" as unknown as number }]).get(1)).toEqual({
      ppg: 12.4,
      games: 1,
    });
  });
});
