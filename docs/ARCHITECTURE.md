# Architecture

How SEC Gridiron 100 fits together: what runs where, where data comes from,
and how it moves through the system. The product rules are in
[PRD.md](PRD.md); this document covers how they're built.

Last updated: 2026-09-29, after Phase 2, the injury feed and the pre-Phase 3 setup.

## Build status

| Phase (PRD Section 5) | Status |
| --- | --- |
| 1. Foundation and database | Done |
| 2. CFBD API and data pipelines | Done, run against the real Supabase project (2026 season loaded, Weeks 5 and 6 priced) |
| Injury feed (added after Phase 2) | Done; table filled from Covers |
| Pre-Phase 3 setup | Job schedules (`vercel.json`) in the repo; `main` branch, hosting, Google sign-in and email follow [SETUP.md](SETUP.md) |
| 3. Authentication and navigation | Not started |
| 4. Lineup builder | Not started |
| 5. Leagues and leaderboards | Not started |
| 6. Admin screen | Not started |
| 7. Polish and deployment (live scoring schedule) | Not started |

## System overview

```mermaid
flowchart LR
  subgraph External
    CFBD[CollegeFootballData API]
    Covers[Covers injury report page]
  end

  subgraph Next.js app
    UI[Pages and Server Actions<br/>signed-in user]
    Jobs["/api/jobs/&lt;job&gt;<br/>CRON_SECRET"]
    Pipelines[src/lib/pipelines]
    Pure[Pure logic<br/>pricing, box scores,<br/>injury parsing and matching]
  end

  subgraph Supabase
    Auth[Supabase Auth]
    DB[(PostgreSQL<br/>tables, triggers, RLS)]
  end

  Cron[Scheduler<br/>Vercel Cron or pg_cron] --> Jobs
  Jobs --> Pipelines
  Pipelines --> Pure
  Pipelines -- secret key, bypasses RLS --> DB
  Pipelines --> CFBD
  Pipelines --> Covers
  UI -- publishable key + user session, RLS applies --> DB
  UI --> Auth
```

There are two ways into the database, and they're kept apart on purpose:

- **Users** (browser, Server Components, Server Actions) use the publishable
  key and their own session. Row Level Security decides what they can read
  and write, and database triggers enforce the game rules. The app can't
  bypass either.
- **Scheduled jobs** use the secret key (`src/lib/supabase/admin.ts`), which
  bypasses RLS. Only the job route imports it.

## Code layout

| Path | Role |
| --- | --- |
| `src/app` | Pages, layouts and the `/api/jobs/[job]` route |
| `src/proxy.ts`, `src/lib/supabase/proxy.ts` | Refresh the user's session cookie on every request |
| `src/lib/supabase` | Clients: `client.ts` (browser), `server.ts` (server, as the user), `admin.ts` (secret key, jobs only) |
| `src/lib/cfbd` | CFBD client; each method is one API call |
| `src/lib/pricing` | Pricing engine: Blended PPG, starter share, value over fringe, salary limits |
| `src/lib/scoring` | Box score parsing into stat lines |
| `src/lib/injuries` | Covers page parser, name matcher, safety check |
| `src/lib/pipelines` | The jobs: thin database code around the pure functions |
| `supabase/migrations` | Schema, triggers, RLS; the source of truth for the database |
| `supabase/tests` | SQL tests, run against a throwaway Postgres by `npm run test:db` |

Pipelines follow one pattern: load rows, call pure functions (unit tested),
write rows. Anything worth testing lives in a pure function.

## Data sources

| Source | Used for | Cost / limits |
| --- | --- | --- |
| CFBD `/games` | SEC schedule and kickoff times, finished games | Free plan: about 1,000 calls a month |
| CFBD `/roster`, `/recruiting/players` | Player pool, recruiting stars | 16 + 4 calls |
| CFBD `/games/players` | Box scores (stats, fumbles lost, pass attempts, carries) | 1 call per week of games |
| Covers `ncaaf/injuries` page | Injury statuses (display only) | 1 request per run, about 1.3 MB of HTML |

We checked ESPN's college injury feed (stale, dated 2020) and CBS's college
injury page (renders no data) and don't use them. Covers lists players as
first initial and last name, so injuries are matched by team, initial and
last name, with position breaking ties.

## Database

Migrations are applied in order; new changes get a new migration, and
applied ones are never edited.

| Migration | Adds |
| --- | --- |
| `20260929000000_initial_schema` | `profiles`, `players`, `games`, `player_season_projections`, `player_weekly_stats`, `lineups`, `leagues`, `league_members`, `change_log`; lineup validation, locking, scoring refresh, `public_lineups` view, league functions, RLS |
| `20260930000000_data_pipelines` | `app_settings` (tunable pricing and season settings), `player_game_stats` (every game's stat lines), `ppr_points()` |
| `20261001000000_starter_share` | Pass attempts and carries on stat lines, `starter_share` on weekly rows, starter share settings |
| `20261002000000_player_injuries` | `player_injuries` (status, injury, note, source, date, admin override) |

```mermaid
erDiagram
  profiles ||--o{ lineups : owns
  profiles ||--o{ league_members : joins
  leagues ||--o{ league_members : has
  players ||--o{ player_season_projections : "priced from"
  players ||--o{ player_weekly_stats : "salary + stats per week"
  games ||--o{ player_weekly_stats : "kickoff locks"
  players ||--o| player_injuries : "current status"
  players ||--o{ lineups : "fills slots"
  players ||--o{ change_log : "audit"
```

`player_game_stats` has no foreign keys on purpose: it holds last season's
lines and non-conference games, which aren't all in `players` or `games`.

### Rules the database enforces

- **Lineups** (`validate_lineup()` trigger): no duplicate players, positions
  fit their slots, every player is active and priced that week, total salary
  of 100 or less, and no changes to a slot whose player has kicked off.
- **Locking** (`is_player_locked()`): worked out from `games.kickoff_at` at
  save time, so it never depends on a job running on time.
- **Points**: `fantasy_points` is a generated column, so points always match
  the stat line.
- **Hidden picks**: other users' lineups are read through `public_lineups`,
  which shows a slot only once that player has kicked off.
- **Admin writes**: players, projections, salary overrides, settings and
  injuries are writable from the app only by admins (`is_admin()`). An admin
  edit to an injury must set `admin_override`, so the job keeps it.

## Pipelines

Each job is `/api/jobs/<job>` (GET for the scheduler, POST by hand) with
`Authorization: Bearer <CRON_SECRET>`, or `runJob()` called directly with the
admin client. Schedules live in `vercel.json` and run on the production
deployment; Vercel sends the `CRON_SECRET` header itself. Every automated change goes to `change_log` with
`changed_by = NULL`.

| Job | Schedule | CFBD calls | Reads | Writes |
| --- | --- | --- | --- | --- |
| `preseason-setup` | Once per season | ~39 | CFBD games, rosters, recruits, box scores | games, players, player_game_stats, projections |
| `roster-check` | Tuesday 10:00 UTC | 17 | CFBD games, rosters | games (kickoff times), players, change_log |
| `generate-salaries` | Tuesday 12:00 UTC, after roster-check | 0 | players, projections, stat lines, settings | player_weekly_stats (salary, blended PPG, starter share), change_log |
| `score-games` | Every 10 min on game days (not scheduled yet: needs Vercel Pro or pg_cron) | 1–2 per run while live | CFBD box scores, finished games | player_game_stats, player_weekly_stats, games.status, lineup totals |
| `reconcile-week` | Monday 12:00 UTC | 2 | CFBD box scores, finished games | as score-games, marks games final |
| `injury-report` | Daily 13:00 UTC; acts Wed–Fri and within 24h of an SEC kickoff | 0 (1 Covers request) | Covers page, players | player_injuries, change_log |

### Weekly cycle

```mermaid
sequenceDiagram
  participant S as Scheduler
  participant J as Jobs
  participant DB as Database
  participant U as Users
  Note over S,U: Tuesday
  S->>J: roster-check
  S->>J: generate-salaries (next unstarted week)
  J->>DB: salaries fixed for the week
  Note over S,U: Wednesday to Saturday morning
  S->>J: injury-report
  U->>DB: build and save lineups (trigger validates)
  Note over S,U: Game days
  DB-->>U: each player locks at their kickoff
  S->>J: score-games every 10 min
  J->>DB: stats, points, lineup totals (leaderboards update)
  Note over S,U: Monday
  S->>J: reconcile-week
```

### Pricing (generate-salaries)

1. **Inputs per player**: last season's PPG, the preseason projection, this
   season's PPG and games played, and starter share (their share of the
   position group's work over the team's last 3 games, relative to a full
   starter's share).
2. **Blended PPG**: this season's weight is G / (G + 3); the rest is split
   60/40 between last season and the projection, both scaled by starter share.
3. **Salary**: 5 + (Blended PPG − position fringe level) × k, where k makes
   the most expensive possible lineup cost 145. Rounded, kept between 5 and
   30, and moved at most 4 from the previous week.
4. Admin overrides are kept, and the job refuses once any of the week's
   games has kicked off.

All the numbers above live in `app_settings.pricing`, so they can be tuned
without code changes.

### Injuries (injury-report)

1. Fetch and parse the Covers page (one section per FBS team).
2. Match SEC QB/RB/WR/TE entries to active players (team + initial + last
   name, position as tie-breaker, then last name + position as a fallback).
3. **Safety check** before writing anything. It refuses the page if there are
   fewer than 100 teams, a team's rows don't match its printed count, the
   page lists nobody, most statuses aren't recognised, fewer than 12 SEC
   teams appear, or the report would cut stored injuries by more than 60%.
   A refusal is logged as `injury_report_skipped` and the old data stays.
4. Upsert matched rows (skipping admin overrides), then clear players no
   longer listed, only for teams that were on the page.
5. Log unmatched names as `injury_unmatched`, once per name per season.

Injury status is display only; pricing never reads it.

## Configuration

| Variable | Where it's used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | All clients. Just `https://<ref>.supabase.co`, no path |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server clients (safe to expose) |
| `SUPABASE_SECRET_KEY` | `admin.ts` only (jobs) |
| `CFBD_API_KEY` | CFBD client |
| `CRON_SECRET` | Job route authorization; Vercel Cron sends it automatically |

## Decisions

| Date | Decision | Why |
| --- | --- | --- |
| Phase 1 | Game rules enforced by database triggers and RLS, not just the app | The rules hold even if the client is bypassed |
| Phase 1 | Per-player locking computed from kickoff times | No dependency on a job running at the right moment |
| Phase 2 | Pure functions for pricing, parsing and week picking; thin DB code | Testable without a database or network |
| Phase 2 | Settings in `app_settings` | Pricing can be tuned from the admin screen |
| 2026-09-29 | Starter share scales last season and the projection | Backups were priced like starters |
| 2026-09-29 | Injuries from Covers; display only | Only one of the three sources had current data |
| 2026-09-29 | Injury writes guarded by a safety check | A broken page read must never wipe good data |
| 2026-09-29 | Host on Vercel; schedule the daily-or-less jobs now, live scoring later | Keeps stats and prices current before launch on the free plan |

## Open items

- **Pricing tuning**: starting QBs rose 4–6 credits after the starter share
  change; 418 of 507 Week 6 players sit at the 5-credit floor; a larger pool
  can push prices down by the full weekly limit when stats haven't changed.
- **Injury "healthy" status**: an admin can't yet mark a listed player as
  healthy for good (a removed row comes back while Covers still lists them).
- **Covers terms of use**: review before relying on the page in production.
- **Live scoring schedule**: `score-games` every 10 minutes needs Vercel Pro
  or Supabase pg_cron (Phase 7). Until then Monday's `reconcile-week` brings
  in final stats.
- **Email**: Supabase's built-in email is rate limited; custom SMTP is needed
  before launch (SETUP.md step 5).

## Keeping this document current

Update this file in the same commit as any change to the architecture: a new
table or migration, a new job or data source, a change to how the app talks
to the database, or a decision worth recording. Update the build status table
when a phase finishes.
