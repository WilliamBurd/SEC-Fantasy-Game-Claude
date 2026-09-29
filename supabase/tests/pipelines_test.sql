-- Tests for the data pipeline migration: settings, game stat lines and the
-- shared PPR function. Uses its own fixtures (ids 1000+) so it doesn't
-- affect the other test files.

\set ON_ERROR_STOP on
SET client_min_messages = warning;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'fan@example.com'),
  ('00000000-0000-0000-0000-0000000000e2', 'ops@example.com');
INSERT INTO public.profiles (id, username, is_admin) VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'fan', FALSE),
  ('00000000-0000-0000-0000-0000000000e2', 'ops', TRUE);

-------------------------------------------------------------------------------
-- ppr_points matches the weekly stats formula
-------------------------------------------------------------------------------

INSERT INTO public.players (id, first_name, last_name, team, position) VALUES
  (1001, 'Test', 'Receiver', 'LSU', 'WR');
INSERT INTO public.games (id, season, week, home_team, away_team, kickoff_at) VALUES
  (1100, 2026, 9, 'LSU', 'Auburn', NOW() + INTERVAL '3 days');
INSERT INTO public.player_weekly_stats
  (player_id, season, week, game_id, salary, receptions, rec_yds, rec_td, rush_yds, fumbles_lost, pass_yds)
VALUES (1001, 2026, 9, 1100, 12, 7, 93, 1, 4, 1, 21);

SELECT tests.assert_eq(
  public.ppr_points(21, 0, 0, 4, 0, 7, 93, 1, 1),
  (SELECT fantasy_points FROM public.player_weekly_stats WHERE player_id = 1001)::NUMERIC,
  'ppr_points matches player_weekly_stats');
-- 21/25 + 4/10 + 7 + 93/10 + 6 - 2 = 0.84 + 0.4 + 7 + 9.3 + 6 - 2 = 21.54
SELECT tests.assert_eq(public.ppr_points(21, 0, 0, 4, 0, 7, 93, 1, 1), 21.54::NUMERIC, 'ppr_points value');

-------------------------------------------------------------------------------
-- player_game_stats
-------------------------------------------------------------------------------

-- Last season's game at another school: no players or games row needed.
INSERT INTO public.player_game_stats (player_id, game_id, season, week, team, pass_yds, pass_td, interceptions)
VALUES (1002, 900001, 2025, 4, 'Memphis', 300, 3, 0);
SELECT tests.assert_eq(
  (SELECT fantasy_points FROM public.player_game_stats WHERE game_id = 900001),
  24.00::NUMERIC(6,2), 'game stats fantasy points');

SET ROLE anon;
SELECT tests.sign_in(NULL);
SELECT tests.assert_eq((SELECT count(*) FROM public.player_game_stats), 1::BIGINT, 'anon reads game stats');
RESET ROLE;

SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-0000000000e2');
SELECT tests.expect_error(
  $$INSERT INTO public.player_game_stats (player_id, game_id, season, week, team) VALUES (1, 1, 2026, 1, 'LSU')$$,
  'permission denied');
SELECT tests.expect_error($$UPDATE public.player_game_stats SET pass_yds = 999$$, 'permission denied');
RESET ROLE;

-------------------------------------------------------------------------------
-- Settings
-------------------------------------------------------------------------------

SELECT tests.assert_eq(
  (SELECT (value ->> 'first_contest_week')::INT FROM public.app_settings WHERE key = 'season'), 3,
  'first contest week default');
SELECT tests.assert_eq(
  (SELECT (value -> 'fringe_depth' ->> 'WR')::INT FROM public.app_settings WHERE key = 'pricing'), 3,
  'WR fringe depth default');

SET ROLE anon;
SELECT tests.sign_in(NULL);
SELECT tests.assert_eq((SELECT count(*) FROM public.app_settings), 2::BIGINT, 'anon reads settings');
RESET ROLE;

-- Non-admins can't change settings.
SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-0000000000e1');
UPDATE public.app_settings SET value = '{"first_contest_week": 9}' WHERE key = 'season';
SELECT tests.expect_error($$INSERT INTO public.app_settings (key, value) VALUES ('x', '{}')$$, 'permission denied');
RESET ROLE;
SELECT tests.assert_eq(
  (SELECT (value ->> 'first_contest_week')::INT FROM public.app_settings WHERE key = 'season'), 3,
  'non-admin settings update has no effect');

-- Admins can.
SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-0000000000e2');
UPDATE public.app_settings SET value = '{"first_contest_week": 4}' WHERE key = 'season';
RESET ROLE;
SELECT tests.assert_eq(
  (SELECT (value ->> 'first_contest_week')::INT FROM public.app_settings WHERE key = 'season'), 4,
  'admin settings update');

-- Clean up so later test files see the defaults.
UPDATE public.app_settings SET value = '{"first_contest_week": 3}' WHERE key = 'season';
DELETE FROM public.player_weekly_stats WHERE player_id = 1001;
DELETE FROM public.games WHERE id = 1100;
DELETE FROM public.players WHERE id = 1001;
DELETE FROM public.player_game_stats WHERE game_id = 900001;

\echo 'All pipeline tests passed.'
