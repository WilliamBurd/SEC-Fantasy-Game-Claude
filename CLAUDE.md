@AGENTS.md

# SEC Gridiron 100

- Product requirements: `docs/PRD.md`. The build follows its Section 5 phases in order.
- Architecture: `docs/ARCHITECTURE.md`. Update it in the same commit whenever you add a table, job, data source or notable decision, and when a phase finishes.
- Database schema: `supabase/migrations/`. Add new migrations rather than editing applied ones.
- After changing SQL, run `npm run test:db` against a local Postgres; after changing app code, run `npm test`, `npm run lint` and `npm run build`.
- `src/lib/supabase/admin.ts` uses the secret key and bypasses Row Level Security. Only trusted server code (scheduled jobs) may import it.
- Pipelines (`src/lib/pipelines`) keep logic in pure, unit-tested functions (pricing, roster diff, box score parsing, week pickers) and database access thin.
