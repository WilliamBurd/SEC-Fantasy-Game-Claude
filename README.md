# SEC Gridiron 100

Weekly redraft fantasy football for the SEC. Each week, users draft seven
players (QB, 2 RB, 2 WR, TE, FLEX) under a 100-credit salary cap. Scoring is
standard PPR, and each player locks when their own game kicks off.

The full product requirements are in [docs/PRD.md](docs/PRD.md).

## Tech stack

- [Next.js](https://nextjs.org) (App Router) with TypeScript
- [Tailwind CSS](https://tailwindcss.com) and [shadcn/ui](https://ui.shadcn.com) components
- [Supabase](https://supabase.com) for the database (PostgreSQL) and sign-in
- [CollegeFootballData](https://collegefootballdata.com) for rosters, schedules and stats

## Project layout

| Path | What's there |
| --- | --- |
| `src/app` | Pages and layouts |
| `src/components/ui` | shadcn/ui components |
| `src/lib/supabase` | Supabase clients for the browser, the server, the proxy, and trusted jobs |
| `src/lib/cfbd` | CollegeFootballData API client |
| `src/lib/pricing` | Pricing engine: Blended PPG, value over fringe, salaries |
| `src/lib/scoring` | Box score parsing |
| `src/lib/injuries` | Covers injury report parsing, name matching and safety check |
| `src/lib/pipelines` | Data pipelines: pre-season setup, roster check, salaries, scoring, injuries |
| `src/app/api/jobs/[job]` | API route that runs a pipeline |
| `src/proxy.ts` | Keeps the signed-in session fresh on every request |
| `supabase/migrations` | Database schema, lineup rules and Row Level Security |
| `supabase/tests` | Database tests |
| `docs/PRD.md` | Product requirements |

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase project's
   URL, publishable key and secret key (Supabase dashboard -> Project Settings
   -> API Keys), your CFBD API key, and a `CRON_SECRET` of your choice.
3. Apply the database schema: open the Supabase dashboard -> SQL Editor, and
   run each file in `supabase/migrations/` in order, oldest first. (Or, with
   the Supabase CLI linked to your project, `supabase db push`.)
4. Start the app: `npm run dev`, then open http://localhost:3000.

## Data pipelines

Each pipeline is an API route. Run one by hand with:

```sh
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/jobs/roster-check"
```

| Job | When | What it does |
| --- | --- | --- |
| `preseason-setup` | Once per season | Schedule, rosters, recruiting stars, last season's and this season's stats, projections |
| `roster-check` | Tuesday morning | Refreshes kickoff times and rosters |
| `generate-salaries` | Tuesday morning, after the roster check | Prices the next week that hasn't started |
| `score-games` | Every 10 minutes on game days | Live stats and lineup scores (does nothing when no game is live) |
| `reconcile-week` | Monday | Final stats and scores for the week just played |
| `injury-report` | Daily (acts Wednesday to Friday and before game days) | Injury statuses from Covers, for display only |

Add `?season=2026&week=7` to pick a season or week; otherwise each job picks
the natural one. Add `?force=1` to run the injury report on any day.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the app locally |
| `npm run build` | Builds for production |
| `npm run lint` | Checks the code with ESLint |
| `npm test` | Runs the unit tests (pricing, box scores, rosters, injuries) |
| `npm run test:db` | Runs the database tests against a local Postgres (set `PGHOST`, `PGPORT`, `PGUSER`) |

The database tests create a throwaway database, load a small stand-in for
Supabase's auth schema, apply every migration, and check the lineup rules,
scoring and Row Level Security policies.
