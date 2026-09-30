-- SEC Gridiron 100: leaderboards (Phase 5).
--
-- leaderboard() ranks users by one week's score and by their season total,
-- for everyone (global) or for one private league. It runs with the
-- caller's rights: scores come from public_lineups (which everyone may
-- read), and a league's members are visible only to its members, so a
-- non-member asking for a league's board gets no rows.

CREATE OR REPLACE FUNCTION public.leaderboard(p_season INT, p_week INT, p_league_id UUID DEFAULT NULL)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  week_score NUMERIC,
  season_score NUMERIC,
  week_rank BIGINT,
  season_rank BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH entrants AS (
    -- A league's board lists every member, lineup or not; the global board
    -- lists everyone who has saved a lineup this season.
    SELECT m.user_id
      FROM public.league_members m
     WHERE p_league_id IS NOT NULL AND m.league_id = p_league_id
    UNION
    SELECT l.user_id
      FROM public.public_lineups l
     WHERE p_league_id IS NULL AND l.season = p_season
  ),
  totals AS (
    SELECT e.user_id,
           COALESCE(SUM(l.total_score) FILTER (WHERE l.week = p_week), 0)::NUMERIC(8,2) AS week_score,
           COALESCE(SUM(l.total_score), 0)::NUMERIC(8,2) AS season_score
      FROM entrants e
      LEFT JOIN public.public_lineups l ON l.user_id = e.user_id AND l.season = p_season
     GROUP BY e.user_id
  )
  SELECT t.user_id,
         p.username,
         t.week_score,
         t.season_score,
         RANK() OVER (ORDER BY t.week_score DESC) AS week_rank,
         RANK() OVER (ORDER BY t.season_score DESC) AS season_rank
    FROM totals t
    JOIN public.profiles p ON p.id = t.user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.leaderboard(INT, INT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leaderboard(INT, INT, UUID) TO authenticated;

-- A league's admin can't leave it (nobody could then rename or delete it);
-- they delete the league instead. Deleting the league still removes every
-- member, because by then the league row is already gone.
CREATE OR REPLACE FUNCTION public.keep_league_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.leagues WHERE id = OLD.league_id AND admin_id = OLD.user_id) THEN
    RAISE EXCEPTION 'You run this league, so you can''t leave it. Delete the league instead.';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER league_members_keep_admin
  BEFORE DELETE ON public.league_members
  FOR EACH ROW EXECUTE FUNCTION public.keep_league_admin();
