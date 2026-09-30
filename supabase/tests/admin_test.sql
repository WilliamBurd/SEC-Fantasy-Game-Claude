-- Tests for the admin screen's database rules: hand-added players, admin
-- deactivation, projections, salary overrides (until the week's first
-- kickoff), merging a temporary player into their CFBD player, and the
-- change log. Uses its own users, players and season (2031), and cleans up.

\set ON_ERROR_STOP on
SET client_min_messages = warning;

-------------------------------------------------------------------------------
-- Fixtures (as the database owner, like the scheduled jobs)
-------------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000ad01', 'admin-test@example.com'),
  ('00000000-0000-0000-0000-00000000ad02', 'user-test@example.com');
INSERT INTO public.profiles (id, username, is_admin) VALUES
  ('00000000-0000-0000-0000-00000000ad01', 'admin_tester', TRUE),
  ('00000000-0000-0000-0000-00000000ad02', 'plain_tester', FALSE);

INSERT INTO public.players (id, first_name, last_name, team, position) VALUES
  (9001, 'Cfbd', 'Player', 'Georgia', 'WR'),
  (9002, 'Late', 'Arrival', 'Georgia', 'RB');
-- Week 1 is still to come; week 2 has started (one game kicked off an hour ago).
INSERT INTO public.games (id, season, week, home_team, away_team, kickoff_at) VALUES
  (9101, 2031, 1, 'Georgia', 'Auburn', NOW() + INTERVAL '2 days'),
  (9102, 2031, 2, 'Georgia', 'Florida', NOW() + INTERVAL '1 day'),
  (9103, 2031, 2, 'Alabama', 'LSU', NOW() - INTERVAL '1 hour');
INSERT INTO public.player_weekly_stats (player_id, season, week, game_id, salary) VALUES
  (9001, 2031, 1, 9101, 10),
  (9001, 2031, 2, 9102, 10);

-- The jobs' own writes (not the app's signed-in role) aren't changed or logged.
UPDATE public.player_weekly_stats SET salary = 11 WHERE player_id = 9001 AND week = 1;
SELECT tests.assert_eq(
  (SELECT salary_overridden FROM public.player_weekly_stats WHERE player_id = 9001 AND week = 1), FALSE,
  'job salary change is not an override');
SELECT tests.assert_eq((SELECT count(*) FROM public.change_log WHERE player_id = 9001), 0::BIGINT, 'job writes not logged');

-------------------------------------------------------------------------------
-- A non-admin can't touch any of it
-------------------------------------------------------------------------------

SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-00000000ad02');
SELECT tests.expect_error(
  $$INSERT INTO public.players (first_name, last_name, team, position) VALUES ('No', 'Way', 'Georgia', 'QB')$$,
  'row-level security');
UPDATE public.player_weekly_stats SET salary = 30 WHERE player_id = 9001;
SELECT tests.expect_error($$SELECT public.merge_admin_player(-1, 9001)$$, 'Only admins');
RESET ROLE;
SELECT tests.assert_eq(
  (SELECT salary FROM public.player_weekly_stats WHERE player_id = 9001 AND week = 1), 11,
  'non-admin salary change has no effect');

-------------------------------------------------------------------------------
-- The admin: players
-------------------------------------------------------------------------------

SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-00000000ad01');

-- Without a CFBD ID: a temporary negative ID. With one: that ID. Always source 'admin'.
INSERT INTO public.players (first_name, last_name, team, position, source) VALUES ('Walk', 'On', 'Georgia', 'RB', 'cfbd');
INSERT INTO public.players (id, first_name, last_name, team, position) VALUES (9003, 'Known', 'Id', 'Georgia', 'TE');
SELECT tests.assert_eq(
  (SELECT id < 0 AND source = 'admin' FROM public.players WHERE first_name = 'Walk'), TRUE,
  'hand-added player without a CFBD ID gets a negative ID');
SELECT tests.assert_eq((SELECT source FROM public.players WHERE id = 9003), 'admin', 'hand-added player keeps a CFBD ID');
SELECT tests.expect_error($$UPDATE public.players SET source = 'cfbd' WHERE id = 9003$$, 'can''t be changed');

-- Editing, deactivating (remembered for the roster check), and a no-op.
UPDATE public.players SET last_name = 'Idd' WHERE id = 9003;
UPDATE public.players SET active = FALSE WHERE id = 9003;
UPDATE public.players SET active = FALSE WHERE id = 9003; -- no change: not logged
SELECT tests.assert_eq((SELECT deactivated_by_admin FROM public.players WHERE id = 9003), TRUE, 'admin deactivation remembered');

-------------------------------------------------------------------------------
-- The admin: projections and salaries
-------------------------------------------------------------------------------

INSERT INTO public.player_season_projections (player_id, season, projected_ppg, projection_source)
VALUES (9001, 2031, 7.5, 'auto');
UPDATE public.player_season_projections SET projected_ppg = 9 WHERE player_id = 9001 AND season = 2031;
SELECT tests.assert_eq(
  (SELECT projection_source FROM public.player_season_projections WHERE player_id = 9001 AND season = 2031), 'admin',
  'admin projection marked admin');

-- Before the week's first kickoff: allowed and marked overridden. After: refused,
-- even for a player whose own game is still to come.
UPDATE public.player_weekly_stats SET salary = 14 WHERE player_id = 9001 AND week = 1;
SELECT tests.assert_eq(
  (SELECT salary_overridden FROM public.player_weekly_stats WHERE player_id = 9001 AND week = 1), TRUE,
  'admin salary change is an override');
SELECT tests.expect_error(
  $$UPDATE public.player_weekly_stats SET salary = 20 WHERE player_id = 9001 AND week = 2$$,
  'Week 2 has kicked off');
UPDATE public.player_weekly_stats SET salary_overridden = FALSE WHERE player_id = 9001 AND week = 1;

-------------------------------------------------------------------------------
-- The admin: merging a temporary player into their CFBD player
-------------------------------------------------------------------------------

-- The temporary player is priced for week 1 and has an admin projection.
INSERT INTO public.player_weekly_stats (player_id, season, week, game_id, salary)
SELECT id, 2031, 1, 9101, 8 FROM public.players WHERE first_name = 'Walk';
INSERT INTO public.player_season_projections (player_id, season, projected_ppg)
SELECT id, 2031, 6 FROM public.players WHERE first_name = 'Walk';
RESET ROLE;

-- A user has the temporary player in their week 1 lineup.
INSERT INTO public.lineups (user_id, season, week, rb1_id)
SELECT '00000000-0000-0000-0000-00000000ad02', 2031, 1, id FROM public.players WHERE first_name = 'Walk';

SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-00000000ad01');
SELECT tests.expect_error($$SELECT public.merge_admin_player(9001, 9002)$$, 'isn''t a temporary');
SELECT tests.expect_error(
  $$SELECT public.merge_admin_player((SELECT id FROM public.players WHERE first_name = 'Walk'), 99999)$$,
  'no CFBD player with ID 99999');
SELECT tests.assert_eq(
  (SELECT public.merge_admin_player((SELECT id FROM public.players WHERE first_name = 'Walk'), 9002)), 1,
  'merge moves one week');
RESET ROLE;

SELECT tests.assert_eq(
  (SELECT salary FROM public.player_weekly_stats WHERE player_id = 9002 AND season = 2031 AND week = 1), 8,
  'week 1 price moved to the CFBD player');
SELECT tests.assert_eq(
  (SELECT rb1_id FROM public.lineups WHERE user_id = '00000000-0000-0000-0000-00000000ad02' AND season = 2031), 9002,
  'saved lineup now holds the CFBD player');
SELECT tests.assert_eq(
  (SELECT projected_ppg FROM public.player_season_projections WHERE player_id = 9002 AND season = 2031), 6.00::NUMERIC(5,2),
  'admin projection copied');
SELECT tests.assert_eq(
  (SELECT active FROM public.players WHERE first_name = 'Walk'), FALSE, 'temporary player retired');

-------------------------------------------------------------------------------
-- The change log
-------------------------------------------------------------------------------

SELECT tests.assert_eq(
  (SELECT string_agg(action, ',' ORDER BY created_at) FROM public.change_log
    WHERE changed_by = '00000000-0000-0000-0000-00000000ad01'),
  'admin_player_added,admin_player_added,admin_player_edited,admin_player_deactivated,admin_projection,admin_projection,admin_salary_override,admin_salary_override_cleared,admin_salary_override,admin_projection,admin_player_merged',
  'every admin change logged, as the admin');
SELECT tests.assert_eq(
  (SELECT (details ->> 'previous_salary')::INT FROM public.change_log
    WHERE action = 'admin_salary_override' AND player_id = 9001), 11,
  'override logs the previous salary');

-------------------------------------------------------------------------------
-- Clean up
-------------------------------------------------------------------------------

DELETE FROM public.change_log WHERE player_id IN (9001, 9002, 9003) OR player_id < 0;
DELETE FROM public.lineups WHERE season = 2031;
DELETE FROM public.player_weekly_stats WHERE season = 2031;
DELETE FROM public.player_season_projections WHERE season = 2031;
DELETE FROM public.games WHERE season = 2031;
DELETE FROM public.players WHERE id IN (9001, 9002, 9003) OR id < 0;
DELETE FROM auth.users WHERE email IN ('admin-test@example.com', 'user-test@example.com');
SELECT tests.sign_in(NULL);

\echo 'All admin tests passed.'
