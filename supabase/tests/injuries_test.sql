-- Tests for the player injuries migration. Uses its own fixtures (ids 3000+)
-- so it doesn't affect the other test files.

\set ON_ERROR_STOP on
SET client_min_messages = warning;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'injury-fan@example.com'),
  ('00000000-0000-0000-0000-0000000000f2', 'injury-ops@example.com');
INSERT INTO public.profiles (id, username, is_admin) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'injury_fan', FALSE),
  ('00000000-0000-0000-0000-0000000000f2', 'injury_ops', TRUE);
INSERT INTO public.players (id, first_name, last_name, team, position) VALUES
  (3001, 'Kewan', 'Lacy', 'Ole Miss', 'RB'),
  (3002, 'Hollywood', 'Smothers', 'Texas', 'RB');

-------------------------------------------------------------------------------
-- The job's writes (secret key, bypasses RLS)
-------------------------------------------------------------------------------

INSERT INTO public.player_injuries (player_id, status, injury, note, source, reported_on)
VALUES (3001, 'out', 'Shoulder', 'Not expected to face the Gators.', 'covers', '2026-09-26');

SELECT tests.expect_error(
  $$INSERT INTO public.player_injuries (player_id, status, source) VALUES (3002, 'injured', 'covers')$$,
  'check constraint');
SELECT tests.expect_error(
  $$INSERT INTO public.player_injuries (player_id, status, source) VALUES (3002, 'out', 'espn')$$,
  'check constraint');
SELECT tests.expect_error(
  $$INSERT INTO public.player_injuries (player_id, status, source) VALUES (99999, 'out', 'covers')$$,
  'foreign key');

-------------------------------------------------------------------------------
-- Everyone reads; only admins write, and their writes are overrides
-------------------------------------------------------------------------------

SET ROLE anon;
SELECT tests.sign_in(NULL);
SELECT tests.assert_eq((SELECT count(*) FROM public.player_injuries), 1::BIGINT, 'anon reads injuries');
SELECT tests.expect_error(
  $$INSERT INTO public.player_injuries (player_id, status, source, admin_override) VALUES (3002, 'out', 'admin', TRUE)$$,
  'row-level security|permission denied');
RESET ROLE;

SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-0000000000f1');
SELECT tests.expect_error(
  $$INSERT INTO public.player_injuries (player_id, status, source, admin_override) VALUES (3002, 'out', 'admin', TRUE)$$,
  'row-level security');
UPDATE public.player_injuries SET status = 'probable' WHERE player_id = 3001;
DELETE FROM public.player_injuries WHERE player_id = 3001;
RESET ROLE;
SELECT tests.assert_eq(
  (SELECT status FROM public.player_injuries WHERE player_id = 3001), 'out',
  'non-admin update and delete have no effect');

SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-0000000000f2');
-- An admin edit must be marked as an override.
SELECT tests.expect_error(
  $$INSERT INTO public.player_injuries (player_id, status, source) VALUES (3002, 'questionable', 'admin')$$,
  'row-level security');
SELECT tests.expect_error(
  $$UPDATE public.player_injuries SET status = 'doubtful' WHERE player_id = 3001$$,
  'row-level security');
INSERT INTO public.player_injuries (player_id, status, source, admin_override)
VALUES (3002, 'questionable', 'admin', TRUE);
UPDATE public.player_injuries SET status = 'doubtful', admin_override = TRUE WHERE player_id = 3001;
RESET ROLE;
SELECT tests.assert_eq(
  (SELECT status || '/' || admin_override FROM public.player_injuries WHERE player_id = 3001), 'doubtful/true',
  'admin override');

SET ROLE authenticated;
SELECT tests.sign_in('00000000-0000-0000-0000-0000000000f2');
DELETE FROM public.player_injuries WHERE player_id = 3002;
RESET ROLE;
SELECT tests.assert_eq(
  (SELECT count(*) FROM public.player_injuries WHERE player_id = 3002), 0::BIGINT, 'admin removes an injury');

-- Clean up so later test files start from a clean slate.
DELETE FROM public.player_injuries WHERE player_id IN (3001, 3002);
DELETE FROM public.players WHERE id IN (3001, 3002);
DELETE FROM public.profiles WHERE id IN ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');
DELETE FROM auth.users WHERE id IN ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');

\echo 'All injury tests passed.'
