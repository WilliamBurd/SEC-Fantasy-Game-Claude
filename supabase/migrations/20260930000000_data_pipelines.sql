-- SEC Gridiron 100: data pipeline support (Phase 2).
--
-- Adds tunable settings for the season and the pricing engine, and a table
-- of every game's stat lines (including non-conference games and last
-- season), which the pricing engine uses for points per game.

-------------------------------------------------------------------------------
-- PPR scoring (PRD 2.3) as a reusable function
-------------------------------------------------------------------------------

-- Same formula as player_weekly_stats.fantasy_points. Yardage points are
-- fractional (30 passing yards = 1.2 pts).
CREATE OR REPLACE FUNCTION public.ppr_points(
  pass_yds INT, pass_td INT, interceptions INT,
  rush_yds INT, rush_td INT,
  receptions INT, rec_yds INT, rec_td INT,
  fumbles_lost INT
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round(
    pass_yds / 25.0 + pass_td * 4 - interceptions * 2
    + (rush_yds + rec_yds) / 10.0 + (rush_td + rec_td) * 6
    + receptions
    - fumbles_lost * 2,
    2
  );
$$;

-------------------------------------------------------------------------------
-- Settings
-------------------------------------------------------------------------------

-- One row per settings group. Admins edit them from the admin screen; the
-- pipelines read them on every run.
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER app_settings_set_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (key, value) VALUES
  ('season', '{
    "first_contest_week": 3
  }'),
  ('pricing', '{
    "prior_season_weight": 0.6,
    "projection_weight": 0.4,
    "current_season_games_offset": 3,
    "fringe_depth": {"QB": 1, "RB": 2, "WR": 3, "TE": 1},
    "min_salary": 5,
    "max_salary": 30,
    "max_weekly_change": 4,
    "top_lineup_target": 145,
    "freshman_projection": {
      "QB": {"5": 8, "4": 4, "3": 1.5, "0": 1},
      "RB": {"5": 7, "4": 4, "3": 2, "0": 1},
      "WR": {"5": 6, "4": 3.5, "3": 2, "0": 1},
      "TE": {"5": 3, "4": 2, "3": 1, "0": 0.5}
    }
  }');

-------------------------------------------------------------------------------
-- Every game's stat lines
-------------------------------------------------------------------------------

-- One row per player per game, for every game an SEC-rostered player played:
-- non-conference games and last season included, so points per game reflect
-- the whole season. No foreign keys: games here are not all in public.games,
-- and last season's rows can predate a player's arrival in the players table.
CREATE TABLE public.player_game_stats (
  player_id INT NOT NULL,
  game_id INT NOT NULL,
  season INT NOT NULL,
  week INT NOT NULL,
  season_type TEXT NOT NULL DEFAULT 'regular',
  team TEXT NOT NULL,
  pass_yds INT NOT NULL DEFAULT 0,
  pass_td INT NOT NULL DEFAULT 0,
  interceptions INT NOT NULL DEFAULT 0,
  rush_yds INT NOT NULL DEFAULT 0,
  rush_td INT NOT NULL DEFAULT 0,
  receptions INT NOT NULL DEFAULT 0,
  rec_yds INT NOT NULL DEFAULT 0,
  rec_td INT NOT NULL DEFAULT 0,
  fumbles_lost INT NOT NULL DEFAULT 0,
  fantasy_points NUMERIC(6,2) GENERATED ALWAYS AS (
    public.ppr_points(pass_yds, pass_td, interceptions, rush_yds, rush_td,
                      receptions, rec_yds, rec_td, fumbles_lost)
  ) STORED,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, game_id)
);

CREATE INDEX player_game_stats_season_week_idx ON public.player_game_stats (season, week);

CREATE TRIGGER player_game_stats_set_updated_at
  BEFORE UPDATE ON public.player_game_stats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-------------------------------------------------------------------------------
-- Row Level Security
-------------------------------------------------------------------------------

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_game_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Settings are readable by everyone"
  ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins update settings"
  ON public.app_settings FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE INSERT, DELETE ON public.app_settings FROM anon, authenticated;

-- Written only by the scheduled jobs (secret key).
CREATE POLICY "Game stats are readable by everyone"
  ON public.player_game_stats FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.player_game_stats FROM anon, authenticated;
