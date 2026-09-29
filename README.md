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
| `src/proxy.ts` | Keeps the signed-in session fresh on every request |
| `supabase/migrations` | Database schema, lineup rules and Row Level Security |
| `supabase/tests` | Database tests |
| `docs/PRD.md` | Product requirements |

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase project's
   URL, publishable key and secret key (Supabase dashboard -> Project Settings
   -> API Keys).
3. Apply the database schema: open the Supabase dashboard -> SQL Editor, paste
   the contents of `supabase/migrations/20260929000000_initial_schema.sql`,
   and run it. (Or, with the Supabase CLI linked to your project,
   `supabase db push`.)
4. Start the app: `npm run dev`, then open http://localhost:3000.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the app locally |
| `npm run build` | Builds for production |
| `npm run lint` | Checks the code with ESLint |
| `npm run test:db` | Runs the database tests against a local Postgres (set `PGHOST`, `PGPORT`, `PGUSER`) |

The database tests create a throwaway database, load a small stand-in for
Supabase's auth schema, apply every migration, and check the lineup rules,
scoring and Row Level Security policies.
