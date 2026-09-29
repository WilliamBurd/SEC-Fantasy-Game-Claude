import { describe, expect, it } from "vitest";

import type { CfbdGamePlayerStats } from "@/lib/cfbd/types";

import { parseGamePlayerStats } from "./box-score";

const athlete = (id: string, name: string, stat: string) => ({ id, name, stat });

// Shaped like a CFBD /games/players response (trimmed).
const games: CfbdGamePlayerStats[] = [
  {
    id: 401752001,
    teams: [
      {
        team: "Georgia",
        conference: "SEC",
        homeAway: "home",
        points: 31,
        categories: [
          {
            name: "passing",
            types: [
              { name: "C/ATT", athletes: [athlete("5001", "QB One", "22/31")] },
              { name: "YDS", athletes: [athlete("5001", "QB One", "287")] },
              { name: "TD", athletes: [athlete("5001", "QB One", "2")] },
              { name: "INT", athletes: [athlete("5001", "QB One", "1")] },
              { name: "QBR", athletes: [athlete("5001", "QB One", "71.2")] },
            ],
          },
          {
            name: "rushing",
            types: [
              { name: "CAR", athletes: [athlete("5001", "QB One", "6"), athlete("5002", "RB One", "18")] },
              { name: "YDS", athletes: [athlete("5001", "QB One", "-4"), athlete("5002", "RB One", "104")] },
              { name: "TD", athletes: [athlete("5001", "QB One", "0"), athlete("5002", "RB One", "1")] },
              { name: "LONG", athletes: [athlete("5002", "RB One", "33")] },
            ],
          },
          {
            name: "receiving",
            types: [
              { name: "REC", athletes: [athlete("5003", "WR One", "8"), athlete("-99", "Team", "0")] },
              { name: "YDS", athletes: [athlete("5003", "WR One", "121")] },
              { name: "TD", athletes: [athlete("5003", "WR One", "1")] },
            ],
          },
          {
            name: "fumbles",
            types: [
              { name: "FUM", athletes: [athlete("5002", "RB One", "2")] },
              { name: "LOST", athletes: [athlete("5002", "RB One", "1")] },
            ],
          },
          {
            name: "defensive",
            types: [{ name: "TOT", athletes: [athlete("6001", "LB One", "9")] }],
          },
        ],
      },
      {
        team: "Kentucky",
        conference: "SEC",
        homeAway: "away",
        points: 10,
        categories: [
          {
            name: "receiving",
            types: [
              { name: "REC", athletes: [athlete("7001", "WR Two", "0")] },
              { name: "YDS", athletes: [athlete("7001", "WR Two", "--")] },
            ],
          },
        ],
      },
    ],
  },
];

describe("parseGamePlayerStats", () => {
  const lines = parseGamePlayerStats(games);
  const byId = (id: number) => lines.find((l) => l.player_id === id);

  it("collects each player's scoring stats across categories", () => {
    expect(byId(5001)).toMatchObject({
      game_id: 401752001,
      team: "Georgia",
      pass_yds: 287,
      pass_td: 2,
      interceptions: 1,
      rush_yds: -4,
      rush_td: 0,
    });
    expect(byId(5002)).toMatchObject({ rush_yds: 104, rush_td: 1, fumbles_lost: 1 });
    expect(byId(5003)).toMatchObject({ receptions: 8, rec_yds: 121, rec_td: 1 });
  });

  it("keeps a line for a player who played but has no scoring stats", () => {
    expect(byId(6001)).toMatchObject({ team: "Georgia", pass_yds: 0, rush_yds: 0, receptions: 0 });
    expect(byId(7001)).toMatchObject({ team: "Kentucky", receptions: 0, rec_yds: 0 });
  });

  it("skips team-total rows", () => {
    expect(lines.some((l) => l.player_id <= 0)).toBe(false);
    expect(lines).toHaveLength(5);
  });
});
