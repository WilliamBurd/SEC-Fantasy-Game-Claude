import { autoProjection } from "@/lib/pricing/projection";
import type { Position } from "@/lib/pricing/settings";

import type { JobContext } from "./context";
import { check, loadSettings, selectAll, upsertAll } from "./db";
import { loadGameStats, summarizeGames } from "./stats";

/**
 * Rebuilds player_season_projections for a season from last season's
 * player_game_stats: Prior Season PPG for everyone, and an automatic
 * Preseason Projection for players whose projection an admin hasn't set.
 */
export async function rebuildProjections(ctx: JobContext, season: number) {
  const { pricing } = await loadSettings(ctx.db);
  const prior = summarizeGames(await loadGameStats(ctx, season - 1));

  const players = await selectAll<{ id: number; position: Position; recruiting_stars: number | null }>(
    "load players",
    (from, to) =>
      ctx.db.from("players").select("id, position, recruiting_stars").eq("active", true).order("id").range(from, to),
  );
  const adminSet = new Set(
    (
      await selectAll<{ player_id: number }>("load admin projections", (from, to) =>
        ctx.db
          .from("player_season_projections")
          .select("player_id")
          .eq("season", season)
          .eq("projection_source", "admin")
          .order("player_id")
          .range(from, to),
      )
    ).map((r) => r.player_id),
  );

  const priorPpg = (id: number) => prior.get(id)?.ppg ?? null;

  await upsertAll(
    ctx.db,
    "player_season_projections",
    players
      .filter((p) => !adminSet.has(p.id))
      .map((p) => ({
        player_id: p.id,
        season,
        prior_season_ppg: priorPpg(p.id),
        projected_ppg: autoProjection(
          { position: p.position, priorSeasonPpg: priorPpg(p.id), recruitingStars: p.recruiting_stars },
          pricing,
        ),
        projection_source: "auto",
      })),
    "player_id,season",
  );
  // Admin projections keep their projected_ppg; only last season's figure is
  // refreshed. There are only a handful, so one update each is fine.
  for (const p of players.filter((p) => adminSet.has(p.id))) {
    const { error } = await ctx.db
      .from("player_season_projections")
      .update({ prior_season_ppg: priorPpg(p.id) })
      .eq("player_id", p.id)
      .eq("season", season);
    check(error, "update admin projection");
  }

  return { players: players.length, withPriorSeason: players.filter((p) => prior.has(p.id)).length };
}
