-- SEC Gridiron 100: initial schema (PRD v2, Section 3).
--
-- Tables, the lineup validation trigger, scoring helpers and Row Level
-- Security policies. Apply it with the Supabase SQL Editor or `supabase db push`.

-------------------------------------------------------------------------------
-- Shared helpers
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-------------------------------------------------------------------------------
-- 1. Users (extends Supabase Auth)
-------------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,20}$'),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Usernames are unique regardless of case ("Bama_Fan" and "bama_fan" clash).
CREATE UNIQUE INDEX profiles_username_lower_key ON public.profiles (lower(username));

-- True when the signed-in user is an admin. SECURITY DEFINER so policies can
-- call it without tripping over the profiles table's own policies.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()),
    FALSE
  );
$$;

-------------------------------------------------------------------------------
-- 2. Players (synced from CFBD, or added by an admin)
-------------------------------------------------------------------------------

CREATE TABLE public.players (
  id INT PRIMARY KEY, -- CFBD player ID (negative = admin-added, not yet matched)
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  team TEXT NOT NULL, -- Must be an SEC team
  position TEXT NOT NULL CHECK (position IN ('QB', 'RB', 'WR', 'TE')),
  class_year INT, -- 1 = freshman, from the CFBD roster
  recruiting_stars INT CHECK (recruiting_stars BETWEEN 0 AND 5),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'cfbd' CHECK (source IN ('cfbd', 'admin')),
  last_seen_on_roster DATE, -- Updated by the weekly roster check
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX players_team_idx ON public.players (team);

CREATE TRIGGER players_set_updated_at
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-------------------------------------------------------------------------------
-- 3. Games (synced from CFBD; drives per-player locking)
-------------------------------------------------------------------------------

CREATE TABLE public.games (
  id INT PRIMARY KEY, -- CFBD game ID
  season INT NOT NULL,
  week INT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'final'))
);

CREATE INDEX games_season_week_idx ON public.games (season, week);

-------------------------------------------------------------------------------
-- 4. Season projections (inputs to the pricing engine)
-------------------------------------------------------------------------------

CREATE TABLE public.player_season_projections (
  player_id INT NOT NULL REFERENCES public.players(id),
  season INT NOT NULL,
  prior_season_ppg NUMERIC(5,2), -- NULL if no previous college data
  projected_ppg NUMERIC(5,2) NOT NULL,
  projection_source TEXT NOT NULL DEFAULT 'auto'
    CHECK (projection_source IN ('auto', 'admin')),
  PRIMARY KEY (player_id, season)
);

-------------------------------------------------------------------------------
-- 5. Weekly player data (prices, stat lines and points scored)
-------------------------------------------------------------------------------

CREATE TABLE public.player_weekly_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id INT NOT NULL REFERENCES public.players(id),
  week INT NOT NULL,
  season INT NOT NULL,
  game_id INT NOT NULL REFERENCES public.games(id),
  blended_ppg NUMERIC(5,2), -- Pricing input used this week
  salary INT NOT NULL CHECK (salary BETWEEN 5 AND 30), -- Set Tuesday mornings
  salary_overridden BOOLEAN NOT NULL DEFAULT FALSE,
  pass_yds INT NOT NULL DEFAULT 0,
  pass_td INT NOT NULL DEFAULT 0,
  interceptions INT NOT NULL DEFAULT 0,
  rush_yds INT NOT NULL DEFAULT 0,
  rush_td INT NOT NULL DEFAULT 0,
  receptions INT NOT NULL DEFAULT 0,
  rec_yds INT NOT NULL DEFAULT 0,
  rec_td INT NOT NULL DEFAULT 0,
  fumbles_lost INT NOT NULL DEFAULT 0,
  -- Standard PPR (PRD 2.3), calculated by the database from the stat line so
  -- points can never drift from the stats. Yardage points are fractional
  -- (e.g. 30 passing yards = 1.2 pts).
  fantasy_points NUMERIC(6,2) GENERATED ALWAYS AS (
    round(
      pass_yds / 25.0 + pass_td * 4 - interceptions * 2
      + (rush_yds + rec_yds) / 10.0 + (rush_td + rec_td) * 6
      + receptions
      - fumbles_lost * 2,
      2
    )
  ) STORED,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, week, season)
);

CREATE INDEX player_weekly_stats_season_week_idx ON public.player_weekly_stats (season, week);
CREATE INDEX player_weekly_stats_game_idx ON public.player_weekly_stats (game_id);

CREATE TRIGGER player_weekly_stats_set_updated_at
  BEFORE UPDATE ON public.player_weekly_stats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- A player is locked once their game for that week has kicked off. Worked out
-- from games.kickoff_at, so it never depends on a scheduled job running on time.
CREATE OR REPLACE FUNCTION public.is_player_locked(p_player_id INT, p_season INT, p_week INT)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.player_weekly_stats s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.player_id = p_player_id
      AND s.season = p_season
      AND s.week = p_week
      AND g.kickoff_at <= NOW()
  );
$$;

-------------------------------------------------------------------------------
-- 6. Lineups
-------------------------------------------------------------------------------

-- Slots may be empty (NULL). An empty slot scores 0.
CREATE TABLE public.lineups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week INT NOT NULL,
  season INT NOT NULL,
  qb_id INT REFERENCES public.players(id),
  rb1_id INT REFERENCES public.players(id),
  rb2_id INT REFERENCES public.players(id),
  wr1_id INT REFERENCES public.players(id),
  wr2_id INT REFERENCES public.players(id),
  te_id INT REFERENCES public.players(id),
  flex_id INT REFERENCES public.players(id),
  total_salary INT NOT NULL DEFAULT 0 CHECK (total_salary BETWEEN 0 AND 100),
  total_score NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week, season)
);

CREATE INDEX lineups_season_week_idx ON public.lineups (season, week);

-- PRD 3.1: enforces the lineup rules on every save, so they hold even if the
-- app is bypassed. Rejects the save with a readable message when a rule fails.
CREATE OR REPLACE FUNCTION public.validate_lineup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  slot_names TEXT[] := ARRAY['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLEX'];
  allowed TEXT[][] := ARRAY[
    ARRAY['QB', 'QB', 'QB'],
    ARRAY['RB', 'RB', 'RB'],
    ARRAY['RB', 'RB', 'RB'],
    ARRAY['WR', 'WR', 'WR'],
    ARRAY['WR', 'WR', 'WR'],
    ARRAY['TE', 'TE', 'TE'],
    ARRAY['RB', 'WR', 'TE']
  ];
  new_ids INT[] := ARRAY[NEW.qb_id, NEW.rb1_id, NEW.rb2_id, NEW.wr1_id, NEW.wr2_id, NEW.te_id, NEW.flex_id];
  old_ids INT[];
  filled INT[];
  i INT;
  p RECORD;
  salary_total INT := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id <> OLD.user_id OR NEW.week <> OLD.week OR NEW.season <> OLD.season THEN
      RAISE EXCEPTION 'A lineup''s user, week and season can''t be changed.';
    END IF;
    old_ids := ARRAY[OLD.qb_id, OLD.rb1_id, OLD.rb2_id, OLD.wr1_id, OLD.wr2_id, OLD.te_id, OLD.flex_id];
  ELSE
    old_ids := ARRAY[NULL, NULL, NULL, NULL, NULL, NULL, NULL]::INT[];
  END IF;

  -- No player in two slots.
  filled := ARRAY(SELECT x FROM unnest(new_ids) AS x WHERE x IS NOT NULL);
  IF cardinality(filled) <> (SELECT count(DISTINCT x) FROM unnest(filled) AS x) THEN
    RAISE EXCEPTION 'A player can fill only one slot in a lineup.';
  END IF;

  FOR i IN 1..7 LOOP
    -- Locked slots: a player whose game has kicked off can't be removed...
    IF old_ids[i] IS DISTINCT FROM new_ids[i]
       AND old_ids[i] IS NOT NULL
       AND public.is_player_locked(old_ids[i], NEW.season, NEW.week) THEN
      RAISE EXCEPTION 'The % slot is locked because that player''s game has kicked off.', slot_names[i];
    END IF;

    IF new_ids[i] IS NULL THEN
      CONTINUE;
    END IF;

    SELECT pl.position, pl.active, s.salary, g.kickoff_at
      INTO p
      FROM public.players pl
      LEFT JOIN public.player_weekly_stats s
        ON s.player_id = pl.id AND s.season = NEW.season AND s.week = NEW.week
      LEFT JOIN public.games g ON g.id = s.game_id
     WHERE pl.id = new_ids[i];

    IF NOT FOUND OR p.salary IS NULL THEN
      RAISE EXCEPTION 'Player % isn''t in the player pool for week % of %.', new_ids[i], NEW.week, NEW.season;
    END IF;

    IF NOT (p.position = ANY (allowed[i:i][1:3])) THEN
      RAISE EXCEPTION 'A % can''t fill the % slot.', p.position, slot_names[i];
    END IF;

    -- ...and a player whose game has kicked off can't be added.
    IF old_ids[i] IS DISTINCT FROM new_ids[i] THEN
      IF NOT p.active THEN
        RAISE EXCEPTION 'Player % is inactive and can''t be added.', new_ids[i];
      END IF;
      IF p.kickoff_at <= NOW() THEN
        RAISE EXCEPTION 'That player''s game has kicked off, so they can''t be added to the % slot.', slot_names[i];
      END IF;
    END IF;

    salary_total := salary_total + p.salary;
  END LOOP;

  IF salary_total > 100 THEN
    RAISE EXCEPTION 'This lineup costs % credits; the cap is 100.', salary_total;
  END IF;

  NEW.total_salary := salary_total;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Fires only when slots change, so the scoring jobs can update total_score
-- without re-running the lineup rules.
CREATE TRIGGER lineups_validate
  BEFORE INSERT OR UPDATE OF user_id, week, season, qb_id, rb1_id, rb2_id, wr1_id, wr2_id, te_id, flex_id
  ON public.lineups
  FOR EACH ROW EXECUTE FUNCTION public.validate_lineup();

-- Recalculates total_score for every lineup in a week from the players'
-- current fantasy_points. Used by live scoring and the Monday reconciliation.
CREATE OR REPLACE FUNCTION public.refresh_lineup_scores(p_season INT, p_week INT)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.lineups l
     SET total_score = COALESCE((
       SELECT sum(s.fantasy_points)
         FROM public.player_weekly_stats s
        WHERE s.season = l.season
          AND s.week = l.week
          AND s.player_id IN (l.qb_id, l.rb1_id, l.rb2_id, l.wr1_id, l.wr2_id, l.te_id, l.flex_id)
     ), 0)
   WHERE l.season = p_season
     AND l.week = p_week;
$$;

-- Everyone's lineups, with each slot hidden until that player's game kicks
-- off (PRD 3.2). Runs with the view owner's rights so it can read all lineups;
-- the masking below is what keeps unlocked picks private.
CREATE VIEW public.public_lineups AS
SELECT
  l.id,
  l.user_id,
  l.season,
  l.week,
  l.total_score,
  CASE WHEN public.is_player_locked(l.qb_id, l.season, l.week) THEN l.qb_id END AS qb_id,
  CASE WHEN public.is_player_locked(l.rb1_id, l.season, l.week) THEN l.rb1_id END AS rb1_id,
  CASE WHEN public.is_player_locked(l.rb2_id, l.season, l.week) THEN l.rb2_id END AS rb2_id,
  CASE WHEN public.is_player_locked(l.wr1_id, l.season, l.week) THEN l.wr1_id END AS wr1_id,
  CASE WHEN public.is_player_locked(l.wr2_id, l.season, l.week) THEN l.wr2_id END AS wr2_id,
  CASE WHEN public.is_player_locked(l.te_id, l.season, l.week) THEN l.te_id END AS te_id,
  CASE WHEN public.is_player_locked(l.flex_id, l.season, l.week) THEN l.flex_id END AS flex_id
FROM public.lineups l;

-------------------------------------------------------------------------------
-- 7. Leagues and 8. League members
-------------------------------------------------------------------------------

CREATE TABLE public.leagues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  invite_code TEXT UNIQUE NOT NULL CHECK (invite_code ~ '^[A-Z0-9]{6}$'),
  admin_id UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.league_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, user_id)
);

CREATE INDEX league_members_user_idx ON public.league_members (user_id);

CREATE OR REPLACE FUNCTION public.is_league_member(p_league_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.league_members m
    WHERE m.league_id = p_league_id AND m.user_id = auth.uid()
  );
$$;

-- Creates a league with a fresh invite code and adds the creator as a member.
CREATE OR REPLACE FUNCTION public.create_league(p_name TEXT)
RETURNS public.leagues
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  chars CONSTANT TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  code TEXT;
  league public.leagues;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to create a league.';
  END IF;

  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::INT, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.leagues WHERE invite_code = code);
  END LOOP;

  INSERT INTO public.leagues (name, invite_code, admin_id)
  VALUES (trim(p_name), code, auth.uid())
  RETURNING * INTO league;

  INSERT INTO public.league_members (league_id, user_id) VALUES (league.id, auth.uid());
  RETURN league;
END;
$$;

-- Joins the league with this invite code. Invite codes stay private: this is
-- the only way to look a league up by code.
CREATE OR REPLACE FUNCTION public.join_league(p_invite_code TEXT)
RETURNS public.leagues
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  league public.leagues;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to join a league.';
  END IF;

  SELECT * INTO league FROM public.leagues WHERE invite_code = upper(trim(p_invite_code));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No league has that invite code.';
  END IF;

  INSERT INTO public.league_members (league_id, user_id)
  VALUES (league.id, auth.uid())
  ON CONFLICT (league_id, user_id) DO NOTHING;
  RETURN league;
END;
$$;

-------------------------------------------------------------------------------
-- 9. Change log (roster check results and admin actions)
-------------------------------------------------------------------------------

CREATE TABLE public.change_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  changed_by UUID REFERENCES public.profiles(id), -- NULL = automated job
  action TEXT NOT NULL, -- e.g. 'player_added', 'player_deactivated', 'salary_override'
  player_id INT REFERENCES public.players(id),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX change_log_created_at_idx ON public.change_log (created_at DESC);

-------------------------------------------------------------------------------
-- Row Level Security (PRD 3.2)
--
-- Scheduled jobs use the secret key, which bypasses these policies. The
-- policies below govern what signed-in users (authenticated) and visitors
-- (anon) can do through the app.
-------------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_season_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_weekly_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;

-- Column privileges: stop users writing columns they don't own, such as
-- is_admin, total_salary and total_score, whatever the row policies allow.
REVOKE INSERT, UPDATE ON public.profiles FROM anon, authenticated;
GRANT INSERT (id, username) ON public.profiles TO authenticated;
GRANT UPDATE (username) ON public.profiles TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.lineups FROM anon, authenticated;
GRANT INSERT (user_id, season, week, qb_id, rb1_id, rb2_id, wr1_id, wr2_id, te_id, flex_id)
  ON public.lineups TO authenticated;
GRANT UPDATE (qb_id, rb1_id, rb2_id, wr1_id, wr2_id, te_id, flex_id)
  ON public.lineups TO authenticated;

-- Leagues are created and joined only through create_league / join_league.
REVOKE INSERT ON public.leagues FROM anon, authenticated;
REVOKE UPDATE ON public.leagues FROM anon, authenticated;
GRANT UPDATE (name) ON public.leagues TO authenticated;
REVOKE INSERT, UPDATE ON public.league_members FROM anon, authenticated;

-- Profiles: usernames are public (leaderboards); each user writes only their own.
CREATE POLICY "Profiles are readable by everyone"
  ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users create their own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Game data: readable by everyone, written by admins (and the scheduled jobs).
CREATE POLICY "Players are readable by everyone"
  ON public.players FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage players"
  ON public.players FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Games are readable by everyone"
  ON public.games FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Projections are readable by everyone"
  ON public.player_season_projections FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage projections"
  ON public.player_season_projections FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Weekly stats are readable by everyone"
  ON public.player_weekly_stats FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage weekly stats"
  ON public.player_weekly_stats FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Lineups: users see and edit only their own. Others' lineups are read
-- through public_lineups. There is no delete: emptying slots is an update,
-- so locked players can't be removed by deleting the lineup.
CREATE POLICY "Users read their own lineups"
  ON public.lineups FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users create their own lineups"
  ON public.lineups FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update their own lineups"
  ON public.lineups FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT ON public.public_lineups TO anon, authenticated;

-- Leagues: visible to their members; renamed or deleted by the league admin.
CREATE POLICY "Members read their leagues"
  ON public.leagues FOR SELECT TO authenticated
  USING (public.is_league_member(id));
CREATE POLICY "League admins rename their league"
  ON public.leagues FOR UPDATE TO authenticated
  USING (admin_id = auth.uid()) WITH CHECK (admin_id = auth.uid());
CREATE POLICY "League admins delete their league"
  ON public.leagues FOR DELETE TO authenticated USING (admin_id = auth.uid());

CREATE POLICY "Members see who is in their leagues"
  ON public.league_members FOR SELECT TO authenticated
  USING (public.is_league_member(league_id));
CREATE POLICY "Users leave leagues"
  ON public.league_members FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Change log: admins only.
CREATE POLICY "Admins read the change log"
  ON public.change_log FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins write the change log"
  ON public.change_log FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND changed_by = auth.uid());

-- Functions: only signed-in users call the league functions; the scoring
-- function is for the scheduled jobs (secret key) only.
REVOKE EXECUTE ON FUNCTION public.create_league(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_league(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_league(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_league(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_lineup_scores(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_lineup_scores(INT, INT) TO service_role;
