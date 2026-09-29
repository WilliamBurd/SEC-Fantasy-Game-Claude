-- Assertion helpers shared by the database tests. Loaded once before the
-- *_test.sql files by scripts/test-db.sh.

\set ON_ERROR_STOP on
SET client_min_messages = warning;

-------------------------------------------------------------------------------
-- Helpers
-------------------------------------------------------------------------------

CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated, service_role;

-- Runs sql and fails unless it raises an error matching pattern.
CREATE FUNCTION tests.expect_error(sql TEXT, pattern TEXT) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  raised BOOLEAN := FALSE;
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN others THEN
    IF SQLERRM !~* pattern THEN
      RAISE EXCEPTION 'Wrong error for [%]: got "%", expected /%/', sql, SQLERRM, pattern;
    END IF;
    raised := TRUE;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Expected an error matching /%/ for [%], but it succeeded', pattern, sql;
  END IF;
END;
$$;

CREATE FUNCTION tests.assert_eq(actual ANYELEMENT, expected ANYELEMENT, label TEXT) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION '%: expected %, got %', label, expected, actual;
  END IF;
END;
$$;

-- Acts as a signed-in user for the rest of the session (NULL = signed out).
CREATE FUNCTION tests.sign_in(user_id UUID) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN user_id IS NULL THEN '' ELSE json_build_object('sub', user_id)::TEXT END,
    FALSE);
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

