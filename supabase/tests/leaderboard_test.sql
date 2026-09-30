-- Tests for leaderboard() and the league admin guard. Uses its own users and
-- season (2030), so it doesn't depend on the other test files.

\set ON_ERROR_STOP on
SET client_min_messages = warning;

-------------------------------------------------------------------------------
-- Fixtures (as the database owner)
-------------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'dave@example.com'),
  ('00000000-0000-0000-0000-0000000000e1', 'erin@example.com'),
  ('00000000-0000-0000-0000-0000000000f1', 'fay@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'outsider@example.com');

INSERT INTO public.profiles (id, username) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'dave'),
  ('00000000-0000-0000-0000-0000000000e1', 'erin'),
  ('00000000-0000-0000-0000-0000000000f1', 'fay'),
  ('00000000-0000-0000-0000-0000000000a1', 'outsider');

-- Empty lineups are allowed; scores are set the way the scoring job does.
INSERT INTO public.lineups (user_id, season, week) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 2030, 1),
  ('00000000-0000-0000-0000-0000000000d1', 2030, 2),
  ('00000000-0000-0000-0000-0000000000e1', 2030, 1),
  ('00000000-0000-0000-0000-0000000000e1', 2030, 2),
  ('00000000-0000-0000-0000-0000000000a1', 2030, 1);
UPDATE public.lineups SET total_score = CASE
    WHEN user_id = '00000000-0000-0000-0000-0000000000d1' AND week = 1 THEN 50
    WHEN user_id = '00000000-0000-0000-0000-0000000000d1' AND week = 2 THEN 10
    WHEN user_id = '00000000-0000-0000-0000-0000000000e1' AND week = 1 THEN 30
    WHEN user_id = '00000000-0000-0000-0000-0000000000e1' AND week = 2 THEN 40
    ELSE 30 END
 WHERE season = 2030;

-------------------------------------------------------------------------------
-- Global board
-------------------------------------------------------------------------------

SET ROLE anon;
SELECT tests.expect_error($$SELECT * FROM public.leaderboard(2030, 2)$$, 'permission denied');
RESET ROLE;

SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-0000000000f1');

SELECT tests.assert_eq((SELECT count(*) FROM public.leaderboard(2030, 2)), 3::BIGINT,
  'global board lists users with a lineup this season');
SELECT tests.assert_eq(
  (SELECT string_agg(username || ':' || week_score || ':' || week_rank, ',' ORDER BY week_rank, username)
     FROM public.leaderboard(2030, 2)),
  'erin:40.00:1,dave:10.00:2,outsider:0.00:3', 'week ranks (no lineup that week scores 0)');
SELECT tests.assert_eq(
  (SELECT string_agg(username || ':' || season_score || ':' || season_rank, ',' ORDER BY season_rank, username)
     FROM public.leaderboard(2030, 2)),
  'erin:70.00:1,dave:60.00:2,outsider:30.00:3', 'season ranks');
-- Ties share a rank.
SELECT tests.assert_eq(
  (SELECT string_agg(username || ':' || week_rank, ',' ORDER BY week_rank, username)
     FROM public.leaderboard(2030, 1)),
  'dave:1,erin:2,outsider:2', 'tied scores share a rank');

-------------------------------------------------------------------------------
-- League board
-------------------------------------------------------------------------------

SELECT tests.sign_in('00000000-0000-0000-0000-0000000000e1');
CREATE TEMP TABLE board_league AS SELECT * FROM public.create_league('Board Test');
SELECT tests.sign_in('00000000-0000-0000-0000-0000000000d1');
SELECT public.join_league((SELECT invite_code FROM board_league));
SELECT tests.sign_in('00000000-0000-0000-0000-0000000000f1');
SELECT public.join_league((SELECT invite_code FROM board_league));

SELECT tests.assert_eq(
  (SELECT string_agg(username || ':' || season_score || ':' || season_rank, ',' ORDER BY season_rank, username)
     FROM public.leaderboard(2030, 2, (SELECT id FROM board_league))),
  'erin:70.00:1,dave:60.00:2,fay:0.00:3', 'league board lists every member, lineup or not');

SELECT tests.sign_in('00000000-0000-0000-0000-0000000000a1');
SELECT tests.assert_eq((SELECT count(*) FROM public.leaderboard(2030, 2, (SELECT id FROM board_league))), 0::BIGINT,
  'non-members see no league board');

-------------------------------------------------------------------------------
-- Leaving and deleting leagues
-------------------------------------------------------------------------------

SELECT tests.sign_in('00000000-0000-0000-0000-0000000000e1');
SELECT tests.expect_error(
  $$DELETE FROM public.league_members WHERE user_id = '00000000-0000-0000-0000-0000000000e1'$$,
  'can''t leave it');

SELECT tests.sign_in('00000000-0000-0000-0000-0000000000f1');
DELETE FROM public.league_members WHERE user_id = '00000000-0000-0000-0000-0000000000f1';
SELECT tests.assert_eq((SELECT count(*) FROM public.leagues WHERE name = 'Board Test'), 0::BIGINT, 'member left');

SELECT tests.sign_in('00000000-0000-0000-0000-0000000000e1');
DELETE FROM public.leagues WHERE name = 'Board Test';
RESET ROLE;
SELECT tests.assert_eq((SELECT count(*) FROM public.leagues WHERE name = 'Board Test'), 0::BIGINT, 'admin deleted league');
SELECT tests.assert_eq(
  (SELECT count(*) FROM public.league_members WHERE user_id IN
    ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1')),
  0::BIGINT, 'deleting a league removes its members');

-- Leave nothing behind for the other test files.
DELETE FROM auth.users WHERE email IN ('dave@example.com', 'erin@example.com', 'fay@example.com', 'outsider@example.com');
SELECT tests.assert_eq((SELECT count(*) FROM public.lineups WHERE season = 2030), 0::BIGINT, 'fixtures removed');

\echo 'All leaderboard tests passed.'
