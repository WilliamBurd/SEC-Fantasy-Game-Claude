import { POSITIONS, type Position, type PricingSettings } from "./settings";

export type PricingInput = {
  playerId: number;
  position: Position;
  team: string;
  /** Last season's fantasy points per game; null with no previous college data. */
  priorSeasonPpg: number | null;
  /** Preseason Projection, in fantasy points per game. */
  projectedPpg: number;
  /** Fantasy points per game this season so far; null before the first game. */
  currentSeasonPpg: number | null;
  /** Games played this season so far. */
  gamesPlayed: number;
  /** Salary in the most recent earlier week this season, if priced then. */
  previousSalary: number | null;
  /** Starter share, 0 to 1 (1 before the team has played). Scales last season and the projection. */
  starterShare: number;
};

export type PricedPlayer = {
  playerId: number;
  position: Position;
  blendedPpg: number;
  starterShare: number;
  /** Points per game above the position's fringe level (never below 0). */
  value: number;
  salary: number;
};

export type PricingResult = {
  players: PricedPlayer[];
  teamsInPool: number;
  /** Teams the fringe levels and credits per point were measured over (all SEC teams). */
  teamsInReference: number;
  /** Fringe level (points per game) at each position. */
  fringeLevel: Record<Position, number>;
  /** Credits per point of value this week. */
  creditsPerPoint: number;
  budgetCheck: {
    /** Cost of the most expensive QB, 2 RB, 2 WR, TE and FLEX together, after rounding and limits. */
    topLineupCost: number;
    target: number;
  };
};

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Blended PPG (PRD 2.5): last season, the preseason projection and this
 * season, with this season's weight growing as G / (G + offset). Last season
 * and the projection are scaled by starter share, since they assume the
 * player still has a starter's role.
 */
export function blendedPpg(input: PricingInput, settings: PricingSettings): number {
  const g = input.currentSeasonPpg === null ? 0 : input.gamesPlayed;
  const currentWeight = g / (g + settings.current_season_games_offset);

  const baseline =
    input.priorSeasonPpg === null
      ? input.projectedPpg
      : (settings.prior_season_weight * input.priorSeasonPpg +
          settings.projection_weight * input.projectedPpg) /
        (settings.prior_season_weight + settings.projection_weight);

  return (
    currentWeight * (input.currentSeasonPpg ?? 0) +
    (1 - currentWeight) * baseline * clamp(input.starterShare, 0, 1)
  );
}

/**
 * Prices one week's player pool (PRD 2.5):
 * 1. Blended PPG for every player.
 * 2. Fringe level per position: the Blended PPG of the player ranked
 *    depth × teams + fringe_rank_offset at that position (0 if there are
 *    fewer players), counted over `reference`: every active player on every
 *    SEC team, not just this week's pool.
 * 3. Value = Blended PPG − fringe level, never below 0.
 * 4. Salary = min + value × k. k is set so the most expensive possible
 *    lineup from `reference` (best QB, 2 RB, 2 WR, TE, FLEX by value) costs
 *    top_lineup_target. One k for every position keeps positions balanced,
 *    and a straight line means any lineup spending the full cap has about
 *    the same expected points however it's built.
 * 5. After a player's first priced week, the salary moves at most
 *    max_weekly_change from the previous one. Then it's kept within
 *    min..max and rounded.
 *
 * Measuring the fringe and k over all SEC teams means a player's price
 * doesn't move just because different teams are in the week's pool.
 * `reference` defaults to the pool itself.
 */
export function priceWeek(
  inputs: PricingInput[],
  settings: PricingSettings,
  reference: PricingInput[] = inputs,
): PricingResult {
  const teamsInPool = new Set(inputs.map((p) => p.team)).size;
  const teamsInReference = new Set(reference.map((p) => p.team)).size;
  const ppg = (input: PricingInput) => blendedPpg(input, settings);

  const fringeLevel = {} as Record<Position, number>;
  for (const position of POSITIONS) {
    const ranked = reference
      .filter((p) => p.position === position)
      .map(ppg)
      .sort((a, b) => b - a);
    const fringeRank = Math.max(1, settings.fringe_depth[position] * teamsInReference + settings.fringe_rank_offset);
    fringeLevel[position] = ranked[fringeRank - 1] ?? 0;
  }
  const valueOf = (input: PricingInput, blended: number) => Math.max(0, blended - fringeLevel[input.position]);

  const withValue = inputs.map((input) => {
    const blended = ppg(input);
    return { input, blendedPpg: blended, value: valueOf(input, blended) };
  });

  const topValue = bestLineup(
    reference.map((p) => ({ playerId: p.playerId, position: p.position, amount: valueOf(p, ppg(p)) })),
  );
  const creditsPerPoint =
    topValue > 0 ? Math.max(0, settings.top_lineup_target - LINEUP_SIZE * settings.min_salary) / topValue : 0;

  const players = withValue.map(({ input, blendedPpg: ppg, value }) => {
    let salary = settings.min_salary + value * creditsPerPoint;
    if (input.previousSalary !== null) {
      salary = clamp(
        salary,
        input.previousSalary - settings.max_weekly_change,
        input.previousSalary + settings.max_weekly_change,
      );
    }
    salary = Math.round(clamp(salary, settings.min_salary, settings.max_salary));
    return {
      playerId: input.playerId,
      position: input.position,
      blendedPpg: round2(ppg),
      starterShare: round2(input.starterShare),
      value: round2(value),
      salary,
    };
  });

  const topLineupCost = mostExpensiveLineup(players);

  return {
    players,
    teamsInPool,
    teamsInReference,
    fringeLevel: Object.fromEntries(
      POSITIONS.map((p) => [p, round2(fringeLevel[p])]),
    ) as Record<Position, number>,
    creditsPerPoint: round2(creditsPerPoint),
    budgetCheck: { topLineupCost, target: settings.top_lineup_target },
  };
}

const LINEUP_SIZE = 7;

type Candidate = { playerId: number; position: Position; amount: number };

/** Largest total `amount` a legal lineup can hold: top QB, 2 RB, 2 WR, TE, then the best remaining FLEX. */
function bestLineup(candidates: Candidate[]): number {
  const top = (position: Position) =>
    candidates.filter((c) => c.position === position).sort((a, b) => b.amount - a.amount);

  const picks = [
    ...top("QB").slice(0, 1),
    ...top("RB").slice(0, 2),
    ...top("WR").slice(0, 2),
    ...top("TE").slice(0, 1),
  ];
  const picked = new Set(picks.map((c) => c.playerId));
  const flex = candidates
    .filter((c) => c.position !== "QB" && !picked.has(c.playerId))
    .sort((a, b) => b.amount - a.amount)[0];
  if (flex) picks.push(flex);

  return picks.reduce((sum, c) => sum + c.amount, 0);
}

/** Cost of the most expensive legal lineup. */
export function mostExpensiveLineup(players: Pick<PricedPlayer, "playerId" | "position" | "salary">[]): number {
  return bestLineup(players.map((p) => ({ playerId: p.playerId, position: p.position, amount: p.salary })));
}
