-- SEC Gridiron 100: player injury statuses.
--
-- The injury-report job reads the Covers college football injury report
-- Wednesday to Friday and before game days, matches its names to our
-- players, and keeps one row per injured player here. Display only: injury
-- status does not feed into pricing.

CREATE TABLE public.player_injuries (
  player_id INT PRIMARY KEY REFERENCES public.players(id),
  status TEXT NOT NULL CHECK (status IN ('out', 'doubtful', 'questionable', 'probable')),
  injury TEXT, -- e.g. 'Knee', 'Undisclosed'
  note TEXT, -- the source's short write-up
  source TEXT NOT NULL CHECK (source IN ('covers', 'admin')),
  reported_on DATE, -- when the source last updated the entry
  -- Set when an admin edits the row: the job then leaves it alone. Deleting
  -- the row hands the player back to the job.
  admin_override BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER player_injuries_set_updated_at
  BEFORE UPDATE ON public.player_injuries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-------------------------------------------------------------------------------
-- Row Level Security
-------------------------------------------------------------------------------

ALTER TABLE public.player_injuries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Injuries are readable by everyone"
  ON public.player_injuries FOR SELECT TO anon, authenticated USING (true);

-- An admin's edit always sets admin_override, so the next job run keeps it.
CREATE POLICY "Admins add injuries"
  ON public.player_injuries FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND admin_override);
CREATE POLICY "Admins edit injuries"
  ON public.player_injuries FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin() AND admin_override);
CREATE POLICY "Admins remove injuries"
  ON public.player_injuries FOR DELETE TO authenticated
  USING (public.is_admin());
