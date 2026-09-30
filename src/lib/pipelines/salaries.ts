import { priceWeek, type PricingInput, type PricingResult } from "@/lib/pricing/engine";
import type { Position, PricingSettings } from "@/lib/pricing/settings";

import type { JobContext } from "./context";
import { check, loadSettings, logChanges, selectAll, upsertAll } from "./db";
import { starterShares } from "./starter-share";
import { loadGameStats, summarizeGames } from "./stats";

export type SalaryRun =
  | { status: "skipped"; season: number; week: number; reason: string }
  | {
      status: "priced";
      season: number;
      week: number;
      priced: number;
      keptOverrides: number;
      summary: Omit<PricingResult, "players">;
    };

type WeekGame = { id: number; home_team: string; away_team: string; kickoff_at: string };

/**
 * Tuesday salary generation (PRD 2.5 and Section 4). Prices every active
 * player on a team in an SEC-vs-SEC game that week, on a scale set by every
 * active SEC player (so prices don't shift with who's in the pool), and writes
 * player_weekly_stats rows. Salaries an admin overrode are kept. Refuses
 * once any of the week's games has kicked off, so prices never change under
 * a locked lineup.
 */
export async function generateSalaries(ctx: JobContext, season: number, week: number): Promise<SalaryRun> {
  const settings = await loadSettings(ctx.db);
  if (week < settings.season.first_contest_week) {
    return { status: "skipped", season, week, reason: `The contest starts in week ${settings.season.first_contest_week}.` };
  }

  const { data: games, error: gamesError } = await ctx.db
    .from("games")
    .select("id, home_team, away_team, kickoff_at")
    .eq("season", season)
    .eq("week", week);
  check(gamesError, "load games");
  const weekGames = (games ?? []) as WeekGame[];
  if (weekGames.length === 0) {
    return { status: "skipped", season, week, reason: "No SEC-vs-SEC games that week." };
  }
  if (weekGames.some((g) => new Date(g.kickoff_at) <= ctx.now)) {
    return { status: "skipped", season, week, reason: "A game that week has already kicked off." };
  }

  const gameOfTeam = new Map<string, number>();
  for (const g of weekGames) {
    gameOfTeam.set(g.home_team, g.id);
    gameOfTeam.set(g.away_team, g.id);
  }

  // Every SEC player sets the price scale; only this week's pool is priced.
  const { inputs: everyone, overridden } = await loadPricingInputs(ctx, season, week, settings.pricing);
  const pool = everyone.filter((p) => gameOfTeam.has(p.team));
  const result = priceWeek(pool, settings.pricing, everyone);
  const teamOf = new Map(pool.map((p) => [p.playerId, p.team]));

  await upsertAll(
    ctx.db,
    "player_weekly_stats",
    result.players
      .filter((p) => !overridden.has(p.playerId))
      .map((p) => ({
        player_id: p.playerId,
        season,
        week,
        game_id: gameOfTeam.get(teamOf.get(p.playerId)!)!,
        blended_ppg: p.blendedPpg,
        starter_share: p.starterShare,
        salary: p.salary,
      })),
    "player_id,week,season",
  );

  const summary = {
    teamsInPool: result.teamsInPool,
    teamsInReference: result.teamsInReference,
    fringeLevel: result.fringeLevel,
    creditsPerPoint: result.creditsPerPoint,
    budgetCheck: result.budgetCheck,
  };
  await logChanges(ctx.db, [{ action: "pricing_run", details: { season, week, ...summary } }]);

  return {
    status: "priced",
    season,
    week,
    priced: result.players.length - overridden.size,
    keptOverrides: overridden.size,
    summary,
  };
}

/**
 * Everything the pricing engine needs for one week, read from the database:
 * every active player (all on SEC teams), with their projections, this
 * season's points, starter share and previous salary, plus the week's admin
 * overrides. Separate from generateSalaries so prices can be previewed
 * without saving.
 */
export async function loadPricingInputs(ctx: JobContext, season: number, week: number, pricing: PricingSettings) {
  const players = await selectAll<{ id: number; position: Position; team: string }>("load players", (from, to) =>
    ctx.db.from("players").select("id, position, team").eq("active", true).order("id").range(from, to),
  );

  const projections = new Map(
    (
      await selectAll<{ player_id: number; prior_season_ppg: number | null; projected_ppg: number }>(
        "load projections",
        (from, to) =>
          ctx.db
            .from("player_season_projections")
            .select("player_id, prior_season_ppg, projected_ppg")
            .eq("season", season)
            .order("player_id")
            .range(from, to),
      )
    ).map((p) => [p.player_id, p]),
  );

  const lines = await loadGameStats(ctx, season, week);
  const current = summarizeGames(lines);
  const positionOf = new Map(
    (
      await selectAll<{ id: number; position: Position }>("load positions", (from, to) =>
        ctx.db.from("players").select("id, position").order("id").range(from, to),
      )
    ).map((p) => [p.id, p.position]),
  );
  const shares = starterShares(lines, players, positionOf, pricing.starter_share);

  // Most recent earlier salary this season, and this week's admin overrides.
  const weekly = await selectAll<{ player_id: number; week: number; salary: number; salary_overridden: boolean }>(
    "load salaries",
    (from, to) =>
      ctx.db
        .from("player_weekly_stats")
        .select("player_id, week, salary, salary_overridden")
        .eq("season", season)
        .lte("week", week)
        .order("week", { ascending: false })
        .order("player_id")
        .range(from, to),
  );
  const previousSalary = new Map<number, number>();
  const overridden = new Set<number>();
  for (const row of weekly) {
    if (row.week === week) {
      if (row.salary_overridden) overridden.add(row.player_id);
    } else if (!previousSalary.has(row.player_id)) {
      previousSalary.set(row.player_id, row.salary);
    }
  }

  const inputs: PricingInput[] = players.map((p) => {
    const projection = projections.get(p.id);
    const thisSeason = current.get(p.id);
    return {
      playerId: p.id,
      position: p.position,
      team: p.team,
      priorSeasonPpg: projection?.prior_season_ppg == null ? null : Number(projection.prior_season_ppg),
      projectedPpg: projection ? Number(projection.projected_ppg) : 0,
      currentSeasonPpg: thisSeason?.ppg ?? null,
      gamesPlayed: thisSeason?.games ?? 0,
      previousSalary: previousSalary.get(p.id) ?? null,
      starterShare: shares.get(p.id) ?? 1,
    };
  });

  return { inputs, overridden };
}
