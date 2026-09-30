-- SEC Gridiron 100: live scoring every 10 minutes (PRD Section 4, Phase 7).
--
-- Run once in the Supabase SQL Editor (SETUP.md step 7). Not a migration: it
-- holds this project's site address and CRON_SECRET, which stay in Supabase
-- Vault (encrypted) and never go in the repository.
--
-- Every 10 minutes pg_cron asks pg_net to POST to the site's score-games job,
-- exactly like Vercel Cron calls the other jobs. When no SEC-vs-SEC game is in
-- progress the job answers "idle" at once, without calling CFBD.

-- 1. Extensions (already on in most Supabase projects; harmless if so).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. The site address and the job secret, in Vault.
--    Replace PASTE_CRON_SECRET_HERE with the CRON_SECRET from Vercel
--    (Project -> Settings -> Environment Variables). Keep the quotes.
SELECT vault.create_secret('https://sec-fantasy-game.vercel.app', 'app_url', 'Site address for scheduled jobs');
SELECT vault.create_secret('PASTE_CRON_SECRET_HERE', 'cron_secret', 'CRON_SECRET for /api/jobs');

-- 3. The schedule (running this again replaces it).
SELECT cron.schedule(
  'score-games',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_url') || '/api/jobs/score-games',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    timeout_milliseconds := 120000
  );
  $$
);

-- Checks (run any time):
--   Is it scheduled?         SELECT jobname, schedule, active FROM cron.job;
--   Did the last runs start? SELECT status, start_time FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
--   Did the site answer?     SELECT status_code, content FROM net._http_response ORDER BY created DESC LIMIT 5;
--     200 with "idle" or "scored" is good; 401 means cron_secret doesn't match Vercel's CRON_SECRET.
--
-- Changing a secret later:
--   SELECT vault.update_secret((SELECT id FROM vault.secrets WHERE name = 'cron_secret'), 'NEW_SECRET');
-- Pausing live scoring:  SELECT cron.unschedule('score-games');
