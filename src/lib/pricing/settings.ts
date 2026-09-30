export const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type Position = (typeof POSITIONS)[number];

export function isPosition(value: string | null | undefined): value is Position {
  return (POSITIONS as readonly string[]).includes(value ?? "");
}

/** The `pricing` row of app_settings. Defaults match the migration's seed. */
export type PricingSettings = {
  prior_season_weight: number;
  projection_weight: number;
  /** The "+3" in the current-season weight G / (G + 3). */
  current_season_games_offset: number;
  /** Starters per team at each position. */
  fringe_depth: Record<Position, number>;
  /**
   * Which player sets the fringe level: the one ranked depth × teams +
   * offset across all SEC teams. 0 = the last starter (every user can pick
   * any starter, so that's what the minimum price buys); 1 = the first backup.
   */
  fringe_rank_offset: number;
  min_salary: number;
  max_salary: number;
  max_weekly_change: number;
  /**
   * Target cost of the most expensive possible lineup (best QB, 2 RB, 2 WR,
   * TE and FLEX). Prices are scaled to hit it, so a user can afford about
   * three stars with fringe players, or one or two stars with lower-level
   * starters.
   */
  top_lineup_target: number;
  /** Preseason projection for players with no college stats, by position and recruiting stars ("0" = unrated). */
  freshman_projection: Record<Position, Record<string, number>>;
  /**
   * Starter share: how much of the position group's work (QB pass attempts,
   * RB carries, WR/TE catches) a player did over the team's last
   * `window_games` games, divided by `full_share` and capped at 1. It scales
   * the last-season and projection part of Blended PPG.
   */
  starter_share: {
    window_games: number;
    full_share: Record<Position, number>;
  };
};

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  prior_season_weight: 0.6,
  projection_weight: 0.4,
  current_season_games_offset: 3,
  fringe_depth: { QB: 1, RB: 2, WR: 3, TE: 1 },
  fringe_rank_offset: 0,
  min_salary: 5,
  max_salary: 30,
  max_weekly_change: 4,
  top_lineup_target: 145,
  freshman_projection: {
    QB: { "5": 8, "4": 4, "3": 1.5, "0": 1 },
    RB: { "5": 7, "4": 4, "3": 2, "0": 1 },
    WR: { "5": 6, "4": 3.5, "3": 2, "0": 1 },
    TE: { "5": 3, "4": 2, "3": 1, "0": 0.5 },
  },
  starter_share: {
    window_games: 3,
    full_share: { QB: 0.7, RB: 0.25, WR: 0.15, TE: 0.45 },
  },
};

/** The `season` row of app_settings. */
export type SeasonSettings = {
  first_contest_week: number;
};

export const DEFAULT_SEASON_SETTINGS: SeasonSettings = { first_contest_week: 3 };

/** Fills any missing keys in stored settings with the defaults. */
export function withDefaults<T extends object>(defaults: T, stored: unknown): T {
  if (!stored || typeof stored !== "object") return defaults;
  const merged = { ...defaults } as Record<string, unknown>;
  for (const [key, value] of Object.entries(stored)) {
    const fallback = (defaults as Record<string, unknown>)[key];
    merged[key] =
      fallback && typeof fallback === "object" && !Array.isArray(fallback)
        ? withDefaults(fallback, value)
        : value;
  }
  return merged as T;
}
