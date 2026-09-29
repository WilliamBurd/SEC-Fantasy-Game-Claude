import type { JobContext } from "./context";
import { syncGames } from "./games";
import { rebuildProjections } from "./projections";
import { fetchRosters, recruitingStarsFor, syncRosters } from "./rosters";
import { SEC } from "./season";
import { loadPlayerIds, storeGameStats } from "./stats";

/** Regular-season weeks to read from last season (empty weeks cost a call and return nothing). */
const PRIOR_SEASON_WEEKS = 16;

/**
 * Pre-season setup (PRD Section 4), run once per season, and safe to re-run:
 * 1. The SEC schedule with kickoff times (1 CFBD call).
 * 2. Every SEC roster, with recruiting stars (16 + 4 calls).
 * 3. Last season's stat lines for those players, at any FBS school, so
 *    transfers keep their history (17 calls).
 * 4. This season's SEC stat lines so far, for a mid-season start (1 call).
 * 5. Prior Season PPG and automatic Preseason Projections.
 * About 39 CFBD calls in all.
 */
export async function preseasonSetup(ctx: JobContext, season: number) {
  const games = await syncGames(ctx, season);

  const rosters = await fetchRosters(ctx, season, games.teams);
  const stars = await recruitingStarsFor(ctx, season, rosters);
  const roster = await syncRosters(ctx, season, rosters, stars);

  const playerIds = await loadPlayerIds(ctx);

  let priorLines = 0;
  for (let week = 1; week <= PRIOR_SEASON_WEEKS; week++) {
    const boxScores = await ctx.cfbd.gamePlayerStats({ year: season - 1, week, classification: "fbs" });
    priorLines += (
      await storeGameStats(ctx, { season: season - 1, seasonType: "regular", boxScores, weekOfGame: () => week, playerIds })
    ).length;
  }
  const bowls = await ctx.cfbd.gamePlayerStats({
    year: season - 1,
    week: 1,
    seasonType: "postseason",
    classification: "fbs",
  });
  priorLines += (
    await storeGameStats(ctx, { season: season - 1, seasonType: "postseason", boxScores: bowls, weekOfGame: () => 1, playerIds })
  ).length;

  const weekOf = new Map(games.allGames.map((g) => [g.id, g.week]));
  const currentBoxScores = await ctx.cfbd.gamePlayerStats({ year: season, conference: SEC });
  const currentLines = (
    await storeGameStats(ctx, {
      season,
      seasonType: "regular",
      boxScores: currentBoxScores,
      weekOfGame: (id) => weekOf.get(id),
      playerIds,
    })
  ).length;

  const projections = await rebuildProjections(ctx, season);

  return {
    season,
    teams: games.teams.length,
    contestGames: games.contestGames,
    roster,
    playersWithStars: stars.size,
    statLinesRead: { lastSeason: priorLines, thisSeason: currentLines },
    projections,
  };
}

/** Weekly roster check (PRD Section 4): the schedule's kickoff times, then every SEC roster (17 CFBD calls). */
export async function weeklyRosterCheck(ctx: JobContext, season: number) {
  const games = await syncGames(ctx, season);
  const rosters = await fetchRosters(ctx, season, games.teams);
  return { season, contestGames: games.contestGames, roster: await syncRosters(ctx, season, rosters) };
}
