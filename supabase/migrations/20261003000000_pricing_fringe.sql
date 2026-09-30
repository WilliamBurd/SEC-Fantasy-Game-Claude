-- SEC Gridiron 100: pricing tuning after the first real prices.
--
-- The fringe level (what the minimum price buys at each position) is now the
-- last starter rather than the first backup: every user can pick any
-- starter, so the worst starter is what 5 credits gets you. It's also
-- measured over every SEC team, not just the week's pool, so a player's
-- price no longer moves because different teams are playing that week.
--
-- fringe_rank_offset: the fringe player is ranked depth × teams + offset.
-- 0 = the last starter; 1 = the first backup (the original rule). Keys
-- already set by an admin are kept.
UPDATE public.app_settings
SET value = '{"fringe_rank_offset": 0}'::JSONB || value
WHERE key = 'pricing';
