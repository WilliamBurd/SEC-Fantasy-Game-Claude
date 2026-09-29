import type { Position, PricingSettings } from "./settings";

/**
 * The automatic Preseason Projection (PRD 2.5), in fantasy points per game.
 * Players with college stats start from last season's points per game; players
 * without (freshmen) get a baseline by position and recruiting stars. Admins
 * can override either on the admin screen.
 */
export function autoProjection(
  input: { position: Position; priorSeasonPpg: number | null; recruitingStars: number | null },
  settings: PricingSettings,
): number {
  if (input.priorSeasonPpg !== null) return input.priorSeasonPpg;

  const table = settings.freshman_projection[input.position];
  const stars = input.recruitingStars ?? 0;
  // Use the highest listed star level at or below the player's rating.
  const levels = Object.keys(table)
    .map(Number)
    .filter((level) => level <= stars)
    .sort((a, b) => b - a);
  return levels.length > 0 ? table[String(levels[0])] : 0;
}
