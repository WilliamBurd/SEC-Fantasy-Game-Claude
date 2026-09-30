-- SEC Gridiron 100: the admin screen (Phase 6).
--
-- Admins edit players, projections and weekly salaries from the app, as
-- signed-in users: Row Level Security (is_admin()) already limits those
-- tables to them. This migration adds what the database should guarantee
-- about those edits, whichever screen or tool makes them:
--
-- - Players added by hand keep their CFBD ID if the admin knows it; the rest
--   get a temporary negative ID, so they can never clash with a CFBD ID.
--   Either way they're marked source = 'admin'. merge_admin_player() later
--   moves a temporary player's upcoming week onto the real CFBD player.
-- - A player an admin deactivates stays inactive: the weekly roster check
--   no longer reactivates them (players.deactivated_by_admin).
-- - An admin's projection is marked 'admin', so the preseason setup keeps it.
-- - An admin's salary change marks the salary as overridden (the Tuesday
--   pricing run keeps it), and is allowed only until the week's first
--   kickoff (PRD 2.7).
-- - Every admin edit is written to change_log, with who made it.
--
-- The triggers act only for the app's signed-in role (`authenticated`). The
-- scheduled jobs (secret key, `service_role`) keep writing freely and log
-- their own changes.

ALTER TABLE public.players ADD COLUMN deactivated_by_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE SEQUENCE public.admin_player_id_seq
  AS INT START WITH -1 INCREMENT BY -1 MINVALUE -2147483648 MAXVALUE -1;
GRANT USAGE ON SEQUENCE public.admin_player_id_seq TO authenticated;

-------------------------------------------------------------------------------
-- Before an admin's write: IDs, sources and the kickoff rule
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prepare_admin_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  kickoff TIMESTAMPTZ;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'players' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.id IS NULL OR NEW.id <= 0 THEN
        NEW.id := nextval('public.admin_player_id_seq');
      END IF;
      NEW.source := 'admin';
      NEW.deactivated_by_admin := NOT NEW.active;
    ELSIF NEW.id <> OLD.id OR NEW.source <> OLD.source THEN
      RAISE EXCEPTION 'A player''s ID and source can''t be changed.';
    ELSIF NEW.active IS DISTINCT FROM OLD.active THEN
      NEW.deactivated_by_admin := NOT NEW.active;
    END IF;

  ELSIF TG_TABLE_NAME = 'player_season_projections' THEN
    NEW.projection_source := 'admin';

  ELSIF TG_TABLE_NAME = 'player_weekly_stats' THEN
    IF TG_OP = 'INSERT' OR NEW.salary IS DISTINCT FROM OLD.salary OR NEW.game_id IS DISTINCT FROM OLD.game_id THEN
      SELECT min(g.kickoff_at) INTO kickoff FROM public.games g WHERE g.season = NEW.season AND g.week = NEW.week;
      IF kickoff <= NOW() THEN
        RAISE EXCEPTION 'Week % has kicked off, so its salaries can''t change now.', NEW.week;
      END IF;
      NEW.salary_overridden := TRUE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER players_prepare_admin_write
  BEFORE INSERT OR UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.prepare_admin_write();
CREATE TRIGGER projections_prepare_admin_write
  BEFORE INSERT OR UPDATE ON public.player_season_projections
  FOR EACH ROW EXECUTE FUNCTION public.prepare_admin_write();
CREATE TRIGGER weekly_stats_prepare_admin_write
  BEFORE INSERT OR UPDATE ON public.player_weekly_stats
  FOR EACH ROW EXECUTE FUNCTION public.prepare_admin_write();

-------------------------------------------------------------------------------
-- After an admin's write: the change log
-------------------------------------------------------------------------------

-- Runs as the admin, so the change_log policy ("admins write the change log,
-- as themselves") applies.
CREATE OR REPLACE FUNCTION public.log_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  action TEXT;
  player INT;
  details JSONB;
  ignored TEXT[] := ARRAY['updated_at', 'last_seen_on_roster', 'deactivated_by_admin'];
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'players' THEN
    player := NEW.id;
    details := jsonb_build_object('name', NEW.first_name || ' ' || NEW.last_name, 'team', NEW.team, 'position', NEW.position);
    IF TG_OP = 'INSERT' THEN
      action := 'admin_player_added';
    ELSIF (to_jsonb(OLD) - ignored) = (to_jsonb(NEW) - ignored) THEN
      RETURN NULL; -- nothing that matters changed
    ELSIF OLD.active AND NOT NEW.active THEN
      action := 'admin_player_deactivated';
    ELSIF NOT OLD.active AND NEW.active THEN
      action := 'admin_player_reactivated';
    ELSE
      action := 'admin_player_edited';
      details := details || jsonb_build_object('before', to_jsonb(OLD) - ignored, 'after', to_jsonb(NEW) - ignored);
    END IF;

  ELSIF TG_TABLE_NAME = 'player_season_projections' THEN
    player := NEW.player_id;
    action := 'admin_projection';
    details := jsonb_build_object(
      'season', NEW.season,
      'projected_ppg', NEW.projected_ppg,
      'prior_season_ppg', NEW.prior_season_ppg,
      'previous_projected_ppg', CASE WHEN TG_OP = 'UPDATE' THEN OLD.projected_ppg END
    );

  ELSIF TG_TABLE_NAME = 'player_weekly_stats' THEN
    player := NEW.player_id;
    details := jsonb_build_object('season', NEW.season, 'week', NEW.week, 'salary', NEW.salary);
    IF TG_OP = 'INSERT' OR NEW.salary IS DISTINCT FROM OLD.salary THEN
      action := 'admin_salary_override';
      details := details || jsonb_build_object('previous_salary', CASE WHEN TG_OP = 'UPDATE' THEN OLD.salary END);
    ELSIF OLD.salary_overridden AND NOT NEW.salary_overridden THEN
      action := 'admin_salary_override_cleared';
    ELSE
      RETURN NULL; -- stat corrections aren't made from the admin screen
    END IF;
  END IF;

  INSERT INTO public.change_log (changed_by, action, player_id, details)
  VALUES (auth.uid(), action, player, details);
  RETURN NULL;
END;
$$;

CREATE TRIGGER players_log_admin_change
  AFTER INSERT OR UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change();
CREATE TRIGGER projections_log_admin_change
  AFTER INSERT OR UPDATE ON public.player_season_projections
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change();
CREATE TRIGGER weekly_stats_log_admin_change
  AFTER INSERT OR UPDATE ON public.player_weekly_stats
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change();

-------------------------------------------------------------------------------
-- Matching a hand-added player to their CFBD player
-------------------------------------------------------------------------------

-- Moves a temporary (negative-ID) player onto the real CFBD player once CFBD
-- lists them: for every week that hasn't kicked off, their price and their
-- spots in saved lineups. Weeks already under way stay with the temporary
-- player (those lineups are locked). Their admin projection is copied over
-- unless the real player has one of their own, and the temporary player is
-- deactivated. Returns how many weeks moved.
CREATE OR REPLACE FUNCTION public.merge_admin_player(p_temporary_id INT, p_cfbd_id INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  temp_player public.players;
  cfbd_player public.players;
  priced RECORD;
  slot TEXT;
  moved INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can merge players.';
  END IF;
  SELECT * INTO temp_player FROM public.players WHERE id = p_temporary_id;
  IF NOT FOUND OR p_temporary_id >= 0 THEN
    RAISE EXCEPTION 'Player % isn''t a temporary (hand-added) player.', p_temporary_id;
  END IF;
  SELECT * INTO cfbd_player FROM public.players WHERE id = p_cfbd_id;
  IF NOT FOUND OR p_cfbd_id <= 0 THEN
    RAISE EXCEPTION 'There''s no CFBD player with ID % yet. The Tuesday roster check adds new CFBD players.', p_cfbd_id;
  END IF;
  IF NOT cfbd_player.active THEN
    RAISE EXCEPTION '% % (ID %) is inactive; reactivate them first.', cfbd_player.first_name, cfbd_player.last_name, p_cfbd_id;
  END IF;

  FOR priced IN
    SELECT s.id, s.season, s.week
      FROM public.player_weekly_stats s
     WHERE s.player_id = p_temporary_id
       AND NOT EXISTS (
         SELECT 1 FROM public.games g
          WHERE g.season = s.season AND g.week = s.week AND g.kickoff_at <= NOW()
       )
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.player_weekly_stats
       WHERE player_id = p_cfbd_id AND season = priced.season AND week = priced.week
    ) THEN
      RAISE EXCEPTION '% % already has a week % price, so the two can''t be merged for that week.',
        cfbd_player.first_name, cfbd_player.last_name, priced.week;
    END IF;
    UPDATE public.player_weekly_stats SET player_id = p_cfbd_id WHERE id = priced.id;
    -- The lineup rules still apply (position, active, cap) as each slot moves.
    FOREACH slot IN ARRAY ARRAY['qb_id', 'rb1_id', 'rb2_id', 'wr1_id', 'wr2_id', 'te_id', 'flex_id'] LOOP
      EXECUTE format('UPDATE public.lineups SET %I = $1 WHERE season = $2 AND week = $3 AND %I = $4', slot, slot)
        USING p_cfbd_id, priced.season, priced.week, p_temporary_id;
    END LOOP;
    moved := moved + 1;
  END LOOP;

  INSERT INTO public.player_season_projections (player_id, season, prior_season_ppg, projected_ppg, projection_source)
  SELECT p_cfbd_id, season, prior_season_ppg, projected_ppg, 'admin'
    FROM public.player_season_projections
   WHERE player_id = p_temporary_id AND projection_source = 'admin'
  ON CONFLICT (player_id, season) DO UPDATE
    SET prior_season_ppg = EXCLUDED.prior_season_ppg,
        projected_ppg = EXCLUDED.projected_ppg,
        projection_source = 'admin'
    WHERE public.player_season_projections.projection_source <> 'admin';

  UPDATE public.players SET active = FALSE, deactivated_by_admin = TRUE WHERE id = p_temporary_id;

  INSERT INTO public.change_log (changed_by, action, player_id, details)
  VALUES (auth.uid(), 'admin_player_merged', p_cfbd_id, jsonb_build_object(
    'temporary_id', p_temporary_id,
    'name', cfbd_player.first_name || ' ' || cfbd_player.last_name,
    'weeks_moved', moved
  ));
  RETURN moved;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merge_admin_player(INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_admin_player(INT, INT) TO authenticated;
