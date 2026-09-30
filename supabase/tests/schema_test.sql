-- Tests for the initial schema: lineup rules, scoring and Row Level Security.
-- Run with scripts/test-db.sh against a throwaway local Postgres. Any failed
-- check stops the run with an error.

\set ON_ERROR_STOP on
SET client_min_messages = warning;

-------------------------------------------------------------------------------
-- Fixtures (as the database owner, like the scheduled jobs)
-------------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'admin@example.com');

INSERT INTO public.profiles (id, username, is_admin) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'alice', FALSE),
  ('00000000-0000-0000-0000-00000000000b', 'bob', FALSE),
  ('00000000-0000-0000-0000-00000000000c', 'boss', TRUE);

INSERT INTO public.players (id, first_name, last_name, team, position, active) VALUES
  (1, 'Early', 'QB', 'Alabama', 'QB', TRUE),
  (2, 'Late', 'QB', 'Georgia', 'QB', TRUE),
  (11, 'Early', 'RB One', 'Alabama', 'RB', TRUE),
  (12, 'Late', 'RB Two', 'Georgia', 'RB', TRUE),
  (13, 'Late', 'RB Three', 'Georgia', 'RB', TRUE),
  (21, 'Late', 'WR One', 'Georgia', 'WR', TRUE),
  (22, 'Late', 'WR Two', 'Georgia', 'WR', TRUE),
  (23, 'Late', 'WR Three', 'Georgia', 'WR', TRUE),
  (31, 'Late', 'TE One', 'Georgia', 'TE', TRUE),
  (32, 'Late', 'TE Two', 'Georgia', 'TE', TRUE),
  (40, 'Gone', 'WR', 'Georgia', 'WR', FALSE),
  (50, 'Star', 'WR', 'Georgia', 'WR', TRUE);

-- Game 100 (Alabama) kicks off in an hour; game 200 (Georgia) tomorrow.
INSERT INTO public.games (id, season, week, home_team, away_team, kickoff_at) VALUES
  (100, 2026, 5, 'Alabama', 'Vanderbilt', NOW() + INTERVAL '1 hour'),
  (200, 2026, 5, 'Georgia', 'Kentucky', NOW() + INTERVAL '1 day');

INSERT INTO public.player_weekly_stats (player_id, season, week, game_id, salary) VALUES
  (1, 2026, 5, 100, 20), (2, 2026, 5, 200, 18),
  (11, 2026, 5, 100, 15), (12, 2026, 5, 200, 12), (13, 2026, 5, 200, 8),
  (21, 2026, 5, 200, 14), (22, 2026, 5, 200, 10), (23, 2026, 5, 200, 6),
  (31, 2026, 5, 200, 9), (32, 2026, 5, 200, 5),
  (40, 2026, 5, 200, 5), (50, 2026, 5, 200, 30);

-------------------------------------------------------------------------------
-- Scoring (PRD 2.3)
-------------------------------------------------------------------------------

-- 250 pass yds (10) + 2 pass TD (8) - 1 INT (-2) + 30 rush yds (3) - 1 fumble (-2) = 17
UPDATE public.player_weekly_stats
   SET pass_yds = 250, pass_td = 2, interceptions = 1, rush_yds = 30, fumbles_lost = 1
 WHERE player_id = 1;
SELECT tests.assert_eq((SELECT fantasy_points FROM public.player_weekly_stats WHERE player_id = 1),
  17.00::NUMERIC(6,2), 'QB fantasy points');

-- 6 rec (6) + 85 rec yds (8.5) + 1 rec TD (6) + 12 rush yds (1.2) = 21.7
UPDATE public.player_weekly_stats
   SET receptions = 6, rec_yds = 85, rec_td = 1, rush_yds = 12
 WHERE player_id = 21;
SELECT tests.assert_eq((SELECT fantasy_points FROM public.player_weekly_stats WHERE player_id = 21),
  21.70::NUMERIC(6,2), 'WR fantasy points');

-------------------------------------------------------------------------------
-- Lineup rules (PRD 3.1), as Alice
-------------------------------------------------------------------------------

SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-00000000000a');

-- A lineup with empty slots is allowed; total_salary is worked out.
INSERT INTO public.lineups (user_id, season, week, qb_id, rb1_id, wr1_id)
VALUES ('00000000-0000-0000-0000-00000000000a', 2026, 5, 1, 11, 21);
SELECT tests.assert_eq((SELECT total_salary FROM public.lineups), 49, 'partial lineup salary');

SELECT tests.expect_error($$UPDATE public.lineups SET flex_id = 21$$, 'only one slot');
SELECT tests.expect_error($$UPDATE public.lineups SET rb2_id = 22$$, 'WR can''t fill the RB2 slot');
SELECT tests.expect_error($$UPDATE public.lineups SET te_id = 21$$, 'only one slot');
SELECT tests.expect_error($$UPDATE public.lineups SET te_id = 12$$, 'RB can''t fill the TE slot');
SELECT tests.expect_error($$UPDATE public.lineups SET qb_id = 31$$, 'TE can''t fill the QB slot');
SELECT tests.expect_error($$UPDATE public.lineups SET wr2_id = 40$$, 'inactive');
SELECT tests.expect_error($$UPDATE public.lineups SET wr2_id = 999$$, 'player pool');

-- FLEX takes RB, WR or TE.
UPDATE public.lineups SET flex_id = 31;
UPDATE public.lineups SET flex_id = 12;
UPDATE public.lineups SET flex_id = 22;

-- QB 20 + RB 15 + WR 14 + FLEX 10 + WR 30 + TE 9 = 98 credits; adding RB2 (8) makes 106.
UPDATE public.lineups SET wr2_id = 50;
UPDATE public.lineups SET te_id = 31;
SELECT tests.assert_eq((SELECT total_salary FROM public.lineups), 98, 'salary before cap check');
SELECT tests.expect_error($$UPDATE public.lineups SET rb2_id = 13$$, '106 credits; the cap is 100');

-- Users can't write the totals, admin flag, or delete a lineup.
SELECT tests.expect_error($$UPDATE public.lineups SET total_score = 500$$, 'permission denied');
SELECT tests.expect_error($$UPDATE public.lineups SET total_salary = 0$$, 'permission denied');
SELECT tests.expect_error($$UPDATE public.profiles SET is_admin = TRUE$$, 'permission denied');
SELECT tests.expect_error($$DELETE FROM public.lineups$$, 'permission denied');

-- Users can't make lineups for someone else.
SELECT tests.expect_error(
  $$INSERT INTO public.lineups (user_id, season, week) VALUES ('00000000-0000-0000-0000-00000000000b', 2026, 5)$$,
  'row-level security');

-- Users can't write game data.
SELECT tests.expect_error(
  $$INSERT INTO public.players (id, first_name, last_name, team, position) VALUES (60, 'X', 'Y', 'LSU', 'QB')$$,
  'row-level security');
UPDATE public.player_weekly_stats SET salary = 5 WHERE player_id = 50;
SELECT tests.assert_eq((SELECT salary FROM public.player_weekly_stats WHERE player_id = 50), 30,
  'non-admin salary update has no effect');
SELECT tests.expect_error($$SELECT public.refresh_lineup_scores(2026, 5)$$, 'permission denied');

RESET ROLE;

-------------------------------------------------------------------------------
-- Per-player locking: game 100 (Alabama) kicks off
-------------------------------------------------------------------------------

UPDATE public.games SET kickoff_at = NOW() - INTERVAL '1 minute' WHERE id = 100;

SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-00000000000a');

SELECT tests.expect_error($$UPDATE public.lineups SET qb_id = 2$$, 'QB slot is locked');
SELECT tests.expect_error($$UPDATE public.lineups SET qb_id = NULL$$, 'QB slot is locked');
SELECT tests.expect_error($$UPDATE public.lineups SET rb1_id = 12$$, 'RB1 slot is locked');
-- Unlocked slots stay editable, including leaving them empty.
UPDATE public.lineups SET wr2_id = NULL;
UPDATE public.lineups SET wr2_id = 23;
UPDATE public.lineups SET flex_id = NULL;
SELECT tests.assert_eq((SELECT qb_id FROM public.lineups), 1, 'locked QB stays');

RESET ROLE;

-- Bob's lineup: tries to add Alabama's already-started QB.
SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-00000000000b');
SELECT tests.expect_error(
  $$INSERT INTO public.lineups (user_id, season, week, qb_id) VALUES ('00000000-0000-0000-0000-00000000000b', 2026, 5, 1)$$,
  'has kicked off');
INSERT INTO public.lineups (user_id, season, week, qb_id, wr1_id)
VALUES ('00000000-0000-0000-0000-00000000000b', 2026, 5, 2, 21);

-- Bob can't see or change Alice's lineup directly...
SELECT tests.assert_eq((SELECT count(*) FROM public.lineups), 1::BIGINT, 'Bob sees only his lineup');
UPDATE public.lineups SET te_id = 32 WHERE user_id = '00000000-0000-0000-0000-00000000000a';
RESET ROLE;
SELECT tests.assert_eq(
  (SELECT te_id FROM public.lineups WHERE user_id = '00000000-0000-0000-0000-00000000000a'), 31,
  'Bob''s update of Alice''s lineup has no effect');

-- ...but sees her locked picks, and only those, in public_lineups.
SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-00000000000b');
SELECT tests.assert_eq(
  (SELECT qb_id FROM public.public_lineups WHERE user_id = '00000000-0000-0000-0000-00000000000a'), 1,
  'locked QB visible');
SELECT tests.assert_eq(
  (SELECT rb1_id FROM public.public_lineups WHERE user_id = '00000000-0000-0000-0000-00000000000a'), 11,
  'locked RB visible');
SELECT tests.assert_eq(
  (SELECT wr1_id FROM public.public_lineups WHERE user_id = '00000000-0000-0000-0000-00000000000a'), NULL::INT,
  'unlocked WR hidden');
RESET ROLE;

-- Signed-out visitors can read public data but not write lineups.
SET ROLE anon;
SELECT tests.sign_in(NULL);
SELECT tests.assert_eq((SELECT count(*) FROM public.public_lineups), 2::BIGINT, 'anon reads public_lineups');
SELECT tests.assert_eq((SELECT count(*) > 0 FROM public.players), TRUE, 'anon reads players');
SELECT tests.expect_error(
  $$INSERT INTO public.lineups (user_id, season, week) VALUES ('00000000-0000-0000-0000-00000000000a', 2026, 6)$$,
  'permission denied');
SELECT tests.expect_error($$SELECT public.create_league('Nope')$$, 'permission denied');
RESET ROLE;

-------------------------------------------------------------------------------
-- Live scoring totals
-------------------------------------------------------------------------------

-- The scheduled jobs run as service_role.
SET ROLE service_role;
SELECT public.refresh_lineup_scores(2026, 5);
RESET ROLE;
-- Alice: QB 1 (17.00) + WR 21 (21.70) + others 0 = 38.70
SELECT tests.assert_eq(
  (SELECT total_score FROM public.lineups WHERE user_id = '00000000-0000-0000-0000-00000000000a'),
  38.70::NUMERIC(6,2), 'Alice total score');
-- Bob: QB 2 (0) + WR 21 (21.70) = 21.70
SELECT tests.assert_eq(
  (SELECT total_score FROM public.lineups WHERE user_id = '00000000-0000-0000-0000-00000000000b'),
  21.70::NUMERIC(6,2), 'Bob total score');

-------------------------------------------------------------------------------
-- Admins
-------------------------------------------------------------------------------

SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-00000000000c');
INSERT INTO public.players (id, first_name, last_name, team, position, source)
VALUES (-1, 'Walk', 'On', 'LSU', 'RB', 'admin');
-- Week 5 has kicked off by now, so its salaries are closed to admins too
-- (20261005000000_admin_screen); admin_test.sql covers overrides before kickoff.
SELECT tests.expect_error(
  $$UPDATE public.player_weekly_stats SET salary = 25 WHERE player_id = 50$$,
  'Week 5 has kicked off');
INSERT INTO public.change_log (changed_by, action, player_id)
VALUES ('00000000-0000-0000-0000-00000000000c', 'salary_override', 50);
-- The hand-added player is logged automatically, plus the manual entry.
SELECT tests.assert_eq((SELECT count(*) FROM public.change_log), 2::BIGINT, 'admin reads change log');
RESET ROLE;

SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-00000000000a');
SELECT tests.assert_eq((SELECT count(*) FROM public.change_log), 0::BIGINT, 'non-admin sees no change log');
RESET ROLE;

-------------------------------------------------------------------------------
-- Leagues
-------------------------------------------------------------------------------

SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-00000000000a');
CREATE TEMP TABLE new_league AS SELECT * FROM public.create_league('  Iron Bowl Crew ');
SELECT tests.assert_eq((SELECT invite_code ~ '^[A-Z0-9]{6}$' FROM new_league), TRUE, 'invite code format');
SELECT tests.assert_eq((SELECT name FROM new_league), 'Iron Bowl Crew', 'league name trimmed');
SELECT tests.assert_eq((SELECT count(*) FROM public.league_members), 1::BIGINT, 'creator is a member');
SELECT tests.expect_error(
  $$INSERT INTO public.leagues (name, invite_code, admin_id) VALUES ('X', 'ABCDEF', '00000000-0000-0000-0000-00000000000a')$$,
  'permission denied');
GRANT SELECT ON new_league TO authenticated;

-- Bob can't see the league until he joins with the code.
SELECT tests.sign_in('00000000-0000-0000-0000-00000000000b');
SELECT tests.assert_eq((SELECT count(*) FROM public.leagues), 0::BIGINT, 'non-member can''t see league');
SELECT tests.expect_error($$SELECT public.join_league('ZZZZZZ')$$, 'No league has that invite code');
SELECT public.join_league(lower((SELECT invite_code FROM new_league)));
SELECT public.join_league((SELECT invite_code FROM new_league)); -- joining twice is harmless
SELECT tests.assert_eq((SELECT count(*) FROM public.leagues), 1::BIGINT, 'member sees league');
SELECT tests.assert_eq((SELECT count(*) FROM public.league_members), 2::BIGINT, 'member sees both members');

-- Only the league admin can rename it.
UPDATE public.leagues SET name = 'Bob''s League';
SELECT tests.assert_eq((SELECT name FROM public.leagues), 'Iron Bowl Crew', 'non-admin rename has no effect');

-- Members can leave.
DELETE FROM public.league_members WHERE user_id = '00000000-0000-0000-0000-00000000000b';
SELECT tests.assert_eq((SELECT count(*) FROM public.leagues), 0::BIGINT, 'left league is hidden');
RESET ROLE;

-------------------------------------------------------------------------------
-- Profiles
-------------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-00000000000d', 'dup@example.com');
SELECT tests.expect_error(
  $$INSERT INTO public.profiles (id, username) VALUES ('00000000-0000-0000-0000-00000000000d', 'ALICE')$$,
  'duplicate key');
SELECT tests.expect_error(
  $$UPDATE public.profiles SET username = 'no spaces!' WHERE username = 'alice'$$,
  'check constraint');

\echo 'All schema tests passed.'
