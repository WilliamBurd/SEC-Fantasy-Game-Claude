import type { CfbdGame } from "@/lib/cfbd/types";

import type { JobContext } from "./context";
import { upsertAll } from "./db";
import { isContestGame, SEC, secTeams } from "./season";

export type GameSync = {
  /** Every game involving an SEC team this season (non-conference included). */
  allGames: CfbdGame[];
  teams: string[];
  contestGames: number;
};

/**
 * Fetches the season's SEC schedule (1 CFBD call) and upserts the SEC-vs-SEC
 * games, with kickoff times, into public.games. Completed games are marked
 * final; other games keep their status, which the scoring job manages.
 */
export async function syncGames(ctx: JobContext, season: number): Promise<GameSync> {
  const allGames = await ctx.cfbd.games(season, SEC, "regular");
  const contest = allGames.filter(isContestGame);

  const row = (g: CfbdGame) => ({
    id: g.id,
    season: g.season,
    week: g.week,
    home_team: g.homeTeam,
    away_team: g.awayTeam,
    // A TBD kickoff arrives as a date only, which locks players early rather
    // than late. The weekly roster check picks up the real time once set.
    kickoff_at: g.startDate,
  });

  await upsertAll(
    ctx.db,
    "games",
    contest.filter((g) => g.completed).map((g) => ({ ...row(g), status: "final" })),
    "id",
  );
  await upsertAll(ctx.db, "games", contest.filter((g) => !g.completed).map(row), "id");

  return { allGames, teams: secTeams(allGames), contestGames: contest.length };
}
