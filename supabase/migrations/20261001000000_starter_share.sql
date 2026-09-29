-- SEC Gridiron 100: starter share in pricing.
--
-- Last season's points and the preseason projection assume a player still
-- has the same role. Starter share measures the role a player has now (their
-- share of their position group's pass attempts, carries or catches over the
-- team's last few games) and scales those two inputs by it, so backups and
-- players who haven't been playing aren't priced like starters.

-- Pass attempts and carries, read from the box scores' C/ATT and CAR columns.
-- Lines stored before this migration read 0 until the pre-season setup is
-- re-run; a position group with no work gets starter share 1, so they don't
-- lower anyone's price.
ALTER TABLE public.player_game_stats
  ADD COLUMN pass_att INT NOT NULL DEFAULT 0,
  ADD COLUMN rush_att INT NOT NULL DEFAULT 0;

-- The starter share each salary was priced with (0 to 1), for the admin screen.
ALTER TABLE public.player_weekly_stats
  ADD COLUMN starter_share NUMERIC(3,2) CHECK (starter_share BETWEEN 0 AND 1);

-- window_games: how many of the team's most recent games to look at.
-- full_share: the share of the position group's work that counts as a full
-- starter (starter share 1). QB and RB use pass attempts and carries; WR and
-- TE use catches. Keys already set by an admin are kept.
UPDATE public.app_settings
SET value = '{
  "starter_share": {
    "window_games": 3,
    "full_share": {"QB": 0.7, "RB": 0.25, "WR": 0.15, "TE": 0.45}
  }
}'::JSONB || value
WHERE key = 'pricing';
