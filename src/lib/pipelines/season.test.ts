import { describe, expect, it } from "vitest";

import type { CfbdGame } from "@/lib/cfbd/types";

import { isContestGame, seasonFor, secTeams } from "./season";

const game = (home: [string, string | null], away: [string, string | null], conferenceGame: boolean): CfbdGame => ({
  id: 1,
  season: 2026,
  week: 3,
  seasonType: "regular",
  startDate: "2026-09-19T16:00:00.000Z",
  startTimeTBD: false,
  completed: false,
  conferenceGame,
  homeTeam: home[0],
  homeConference: home[1],
  awayTeam: away[0],
  awayConference: away[1],
});

describe("isContestGame", () => {
  it("accepts SEC-vs-SEC games only", () => {
    expect(isContestGame(game(["Georgia", "SEC"], ["Auburn", "SEC"], true))).toBe(true);
    expect(isContestGame(game(["Georgia", "SEC"], ["Georgia Tech", "ACC"], false))).toBe(false);
    expect(isContestGame(game(["Alabama", "SEC"], ["Mercer", "SoCon"], false))).toBe(false);
  });
});

describe("secTeams", () => {
  it("lists SEC teams from home and away sides", () => {
    const games = [
      game(["Georgia", "SEC"], ["Georgia Tech", "ACC"], false),
      game(["Clemson", "ACC"], ["LSU", "SEC"], false),
      game(["Georgia", "SEC"], ["LSU", "SEC"], true),
    ];
    expect(secTeams(games)).toEqual(["Georgia", "LSU"]);
  });
});

describe("seasonFor", () => {
  it("counts January bowl games in the previous season", () => {
    expect(seasonFor(new Date("2026-09-29T12:00:00Z"))).toBe(2026);
    expect(seasonFor(new Date("2027-01-08T12:00:00Z"))).toBe(2026);
    expect(seasonFor(new Date("2026-07-01T12:00:00Z"))).toBe(2026);
  });
});
