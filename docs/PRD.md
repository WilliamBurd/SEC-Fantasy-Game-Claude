# Product Requirements Document (PRD)

**Project Name:** SEC Gridiron 100 (Placeholder)\
**Platform:** Web Application (Mobile-Responsive)\
**Tech Stack:** Next.js (App Router, React), Supabase (Auth, PostgreSQL DB), Tailwind CSS, CollegeFootballData (CFBD) API.\
**Version:** 2

## What changed in version 2

- **Lineup locking:** each player locks when their own game kicks off. There is no single lock for the whole week.
- **Pricing:** Week 1 prices blend last season's stats with a preseason projection, so freshmen get a price too. In-season prices shift toward this season's stats, but last season still counts.
- **Authentication:** Phase 3 now builds Google OAuth alongside email/password.
- **Database:** added a games table with kickoff times and a table for projections. Stats are stored line by line. A database check stops duplicate players, wrong positions, going over budget and changes to locked slots. IDs use *gen_random_uuid()*.
- **Live scoring:** lineup totals and leaderboards update after every scoring run during games, not just on Monday.
- **Fumbles:** the scoring pipeline now counts fumbles lost.
- **Rosters:** a weekly roster check keeps the player pool current, and an admin screen covers anything it misses.

## Decisions since version 2

- **Empty slots:** users can save a lineup with empty slots. An empty slot scores 0.
- **Free to play:** no entry fees or cash prizes.
- **SEC-vs-SEC only:** the player pool each week is limited to players whose team plays another SEC team that week. Non-conference games still count toward a player's points per game for pricing.
- **Contest starts in Week 3:** Weeks 1 and 2 have few or no SEC-vs-SEC games, so the contest starts in Week 3 (a setting). From then on, every week with an SEC-vs-SEC game runs.
- **Pricing:** the placeholder tiers are replaced by value-over-fringe pricing (2.5). The formula is agreed in principle and will be tuned once real prices can be seen.
- **Starter share:** after the first dry run with real data, backups and players who hadn't played this season were priced like starters from last season's stats alone. Last season and the projection are now scaled by starter share (2.5).
- **Injury statuses:** read automatically from the Covers college football injury report and shown next to players (out, doubtful, questionable, probable). Display only: they don't affect prices. ESPN's college injury feed and CBS's college injury page were also checked, but ESPN's is stale and CBS's page has no data.

## 1. Product Overview

A weekly redraft college football fantasy app focused exclusively on the SEC. Users get a 100-credit salary cap each week to draft a new lineup. The app uses standard PPR scoring and has a global leaderboard and private leagues. Each player in a lineup locks when their own game kicks off, so users can keep changing the players whose games haven't started yet.

## 2. Core Features

### 2.1. User Authentication & Profile

- **Sign Up/Login:** Email/Password and Google OAuth via Supabase Auth.
- **User Profile:** Display username, total season points, and global rank.

### 2.2. The Lineup Builder (Core Interaction)

- **Format:** Weekly redraft. Users must submit a new lineup every week.
- **Budget:** 100 Credits maximum. Strictly enforced on the client and server.
- **Roster Positions (7 Total):** 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX (RB/WR/TE). A player can fill only one slot. Slots can be left empty; an empty slot scores 0.
- **Player Pool:** Active players on SEC teams playing another SEC team that week. Players on a bye or in a non-conference game are not shown.
- **Per-player locking:** a player locks when their team's game kicks off. Once a slot's player is locked, that slot can't be changed or emptied. A player whose game has already started can't be added. Slots with unlocked players stay editable until those players' games start, including players in Thursday, Friday or late Saturday games.
- **UI/UX:** A drag-and-drop or click-to-add interface. Shows the remaining budget as it changes. Shows each player's kickoff time and a lock icon once they're locked.

### 2.3. Scoring System (Standard PPR)

- **Passing:** 1 pt per 25 yards, 4 pts per TD, -2 pts per INT.
- **Rushing/Receiving:** 1 pt per 10 yards, 6 pts per TD, 1 pt per Reception.
- **Fumbles:** -2 pts for a fumble lost.

### 2.4. Leagues & Leaderboards

- **Global Leaderboard:** Ranks all users by Weekly Score and Total Season Score. Scores update during games after every scoring run.
- **Private Leagues:**
  - Users can create a league and generate a unique 6-character alphanumeric invite code.
  - Users can join multiple leagues via code.
  - League dashboard shows member rankings (Weekly and Season), updating live during games.

### 2.5. Player Pricing Engine

*Note for AI Developer:* CFBD does not provide salaries, so prices are calculated from a player's **Blended Points Per Game (Blended PPG)**. Blended PPG combines three inputs:

- **Prior Season PPG:** the player's fantasy points per game last season, from CFBD box scores. Transfers keep their stats from their previous school. This is empty for players with no college stats (for example, freshmen).
- **Preseason Projection:** an expected points-per-game figure for the coming season. It is set automatically: last season's points per game for returning players, or a baseline by position and recruiting stars for players with no college stats. An admin can adjust it (see 2.7). This is the only input for freshmen, so it matters.
- **Current Season PPG:** the player's fantasy points per game this season, over every game they have played (non-conference included).

**Week 1 prices**

- Returning players: Blended PPG = 60% Prior Season PPG + 40% Preseason Projection.
- Players with no previous college data: Blended PPG = 100% Preseason Projection.

**In-season prices (recalculated every Tuesday)**

- This season's weight grows with games played: Current Season weight = G / (G + 3), where G is the number of games the player has played this season. After 3 games, this season counts for 50%. After 9 games, it counts for 75%.
- The remaining weight is split between Prior Season PPG and Preseason Projection in the same 60/40 ratio as Week 1, or goes fully to the Preseason Projection for players with no previous college data. Last season always keeps some influence.
- **Starter share:** last season and the projection assume the player still has the same role, so both are multiplied by the player's starter share (0 to 1) before blending. This season's points are not. Starter share is the player's part of their position group's work over their team's last 3 games (pass attempts for QBs, carries for RBs, catches for WRs and TEs), divided by the share that counts as a full starter (QB 70%, RB 25%, WR 15%, TE 45%) and capped at 1. A missed game counts as no work, so backups and players who haven't been playing (for example, injured) aren't priced like starters, and a returning player's share recovers as they play. Before a team's first game, everyone's starter share is 1.
- All weights (60/40, the "+3" and the starter share window and thresholds) are stored as configuration so they can be tuned without code changes.

**Blended PPG to salary** (to be tuned once real prices are available)

Prices follow a straight line from each position's fringe level, so any lineup that spends the full 100 credits has about the same expected points whether it's built from several stars plus fringe players or one or two stars plus lower-level starters. Each Tuesday:

1. **Fringe level per position:** the Blended PPG of the first player past the starters, counted over the T teams in the week's pool: QB rank T + 1, RB rank 2T + 1, WR rank 3T + 1, TE rank T + 1.
2. **Value:** Blended PPG minus the position's fringe level, never below 0.
3. **Salary:** 5 + value × k, where k is set so the most expensive possible lineup (best QB, 2 RB, 2 WR, TE and FLEX) costs 145 credits. One k for every position keeps the positions balanced.
4. **Weekly limit:** after a player's first priced week, a salary moves at most 4 credits from the previous week.
5. Salaries are rounded and kept between 5 and 30.

The fringe depths, the 145 target, the weekly limit, the salary range, the blending weights and the starter share settings are all stored in the app_settings table, so they can be tuned from the admin screen.

Salaries for a week are set on Tuesday morning and don't change for that week, unless an admin overrides one before the week's first kickoff.

### 2.6. Keeping the Player Pool Current

Rosters change during the season through transfers, walk-ons, late additions and players leaving teams. Two tools keep the player pool accurate:

- **Weekly roster check:** runs every Tuesday before salary generation (see Section 4).
- **Admin screen:** lets an admin fix anything the roster check misses or gets wrong (see 2.7).

### 2.7. Admin Screen

A page at */admin*, visible only to users with *is_admin = true* in their profile. It supports:

- **Add a player by hand:** name, team, position, and CFBD player ID if one exists. Players without a CFBD ID get a temporary negative ID until they appear in CFBD data, then are matched to it.
- **Edit or deactivate a player:** fix team, position or name, or mark a player inactive so they leave the pool.
- **Set preseason projections:** review and adjust the automatic Preseason Projection, especially for freshmen and new transfers.
- **Override a salary:** change a player's price for the current week, allowed until the week's first kickoff. Saved lineups stay valid. A user whose lineup would go over 100 credits after an override must fix it before they can save changes.
- **Review roster changes:** see what the latest weekly roster check added, deactivated or moved between teams.
- **Run pipelines manually:** trigger the roster check, salary generation or scoring on demand.

Every admin change is recorded in the change log with who made it and when.

## 3. Database Structure (Supabase PostgreSQL)

The schema lives in [`supabase/migrations/20260929000000_initial_schema.sql`](../supabase/migrations/20260929000000_initial_schema.sql), which is the source of truth. It creates nine tables: `profiles`, `players`, `games`, `player_season_projections`, `player_weekly_stats`, `lineups`, `leagues`, `league_members` and `change_log`. IDs use `gen_random_uuid()`.

Beyond the v2 design, the migration:

- Allows empty lineup slots (NULL). An empty slot scores 0.
- Calculates `fantasy_points` in the database from each stat line, with fractional yardage points (30 passing yards = 1.2 pts).
- Adds `public_lineups`, a view that shows another user's pick only once that player's game has kicked off.
- Adds `create_league()` and `join_league()`, so invite codes are never readable directly.
- Adds `refresh_lineup_scores(season, week)` for the scoring jobs.

The Phase 2 migration, [`supabase/migrations/20260930000000_data_pipelines.sql`](../supabase/migrations/20260930000000_data_pipelines.sql), adds:

- `app_settings`: the season and pricing settings (first contest week, blending weights, fringe depths, top-lineup target, weekly limit, salary range, freshman projections). Readable by everyone, editable by admins.
- `player_game_stats`: one stat line per player per game, for every game an SEC-rostered player played, last season and non-conference games included. The pricing engine reads points per game from it.
- `ppr_points()`: the PPR formula as a function, shared by the stat tables.

The starter share migration, [`supabase/migrations/20261001000000_starter_share.sql`](../supabase/migrations/20261001000000_starter_share.sql), adds pass attempts and carries to `player_game_stats`, the starter share each salary was priced with to `player_weekly_stats`, and the starter share settings to `app_settings`.

The injuries migration, [`supabase/migrations/20261002000000_player_injuries.sql`](../supabase/migrations/20261002000000_player_injuries.sql), adds `player_injuries`: one row per injured player with status, injury, note, source and date. Admins can override a row; the injury job then leaves it alone.

### 3.1. Lineup Validation (Database Trigger)

A *validate_lineup()* trigger runs before every insert or update on *lineups*, so the rules hold even if the client is bypassed. It rejects the save unless:

- No player is in two slots. Empty slots are allowed.
- Each filled slot's player fits it: QB in QB, RB in RB1/RB2, WR in WR1/WR2, TE in TE, and RB, WR or TE in FLEX.
- Each player is active and has a *player_weekly_stats* row for that week (on an SEC team with a game that week).
- The total of the players' salaries is 100 or less. The trigger writes this total to *total_salary*.
- On update: no slot whose current player has kicked off is changed, and no newly added player's game has already kicked off.

### 3.2. Row Level Security

- Users can create and edit only their own lineups, and only through the validation above.
- Leaderboards, league standings, players, games and weekly stats are readable by everyone.
- Other users' lineups are read through a view or function that shows a slot only once that slot's player has kicked off. Unlocked picks stay hidden.
- Only admins can write to players, projections, salary overrides and the change log from the app.

## 4. API Integration Plan (CollegeFootballData API)

The backend will require cron jobs (via Next.js API Routes + Vercel Cron, or Supabase Edge Functions / pg_cron) to maintain state.

- **Base URL:** <https://api.collegefootballdata.com>
- **Auth:** Bearer Token required.

Only SEC-vs-SEC games are stored in the games table. Every SEC team's games, including non-conference games, are stored as stat lines in player_game_stats for pricing.

The free CFBD plan allows about 1,000 API calls a month. Each job below lists its calls; live scoring every 10 minutes on game days fits within that.

### Data Pipelines

Each job is an API route, `/api/jobs/<job>`, protected by the `CRON_SECRET` bearer token.

1.  **Pre-Season Setup** (`preseason-setup`, run once per season, safe to re-run; about 39 calls):
    - Endpoints: /games, /roster, /recruiting/players, /games/players
    - Logic: Store the season's SEC-vs-SEC games with kickoff times. Fetch all 16 SEC rosters into players, with recruiting stars from the last four recruiting classes. Store last season's box score lines for those players at any FBS school (so transfers keep their history), and this season's SEC box scores so far (for a mid-season start). Calculate each player's Prior Season PPG and automatic Preseason Projection. Admins then review projections on the admin screen.
2.  **Weekly Roster Check** (`roster-check`, Tuesday morning, runs first; 17 calls):
    - Endpoints: /games, /roster
    - Logic: Refresh kickoff times, since TV slots are often set during the season. Re-fetch all 16 SEC rosters. Add new QB/RB/WR/TE players (fullbacks count as RB) with an automatic projection. Update the team for players who moved to another SEC team. Mark players no longer on any SEC roster as inactive; never delete them, because past lineups still point to them. Admin-added players are left alone. Record every change in the change log.
3.  **Salary Generation** (`generate-salaries`, Tuesday morning, after the roster check; no CFBD calls):
    - Logic: For the next week none of whose games has kicked off (from Week 3), price every active player on a team in an SEC-vs-SEC game, using the pricing engine in 2.5 and the stat lines already stored. Write player_weekly_stats rows, keeping any salary an admin overrode. Record the run's fringe levels, k and top-lineup cost in the change log. Refuses once a game that week has kicked off.
4.  **Game Day Live Scoring** (`score-games`, every 10 minutes; 1 call per run while a game is live, plus 1 when a game may have finished):
    - Endpoint: /games/players (and /games to check for finished games)
    - Logic: Does nothing unless an SEC-vs-SEC game has kicked off and isn't final, so Thursday, Friday and Saturday games are all covered. Store every SEC team's stat lines for the week, copy pool players' lines onto player_weekly_stats (the database calculates PPR points, including fumbles lost), mark games in progress or final, and recalculate every lineup's total_score so leaderboards update live.
    - If a player scores in an SEC-vs-SEC game but isn't in the players table, log it once in the change log so an admin can add them.
    - Note: Vercel's Hobby plan runs cron jobs only once a day. Scoring every 10 minutes needs a Vercel Pro plan or Supabase pg_cron.
5.  **Monday Final Reconciliation** (`reconcile-week`, Monday; 2 calls):
    - Logic: Re-fetch the most recent week's box scores to pick up stat corrections, mark every finished game final, and recalculate every lineup's total_score.
6.  **Injury Report** (`injury-report`, Wednesday to Friday and before game days; no CFBD calls, 1 request to Covers):
    - Logic: Read the Covers injury report, match its SEC QB/RB/WR/TE entries to players by team, first initial and last name (position breaks ties), and replace the stored statuses. Admin overrides are kept. Names that match no player are logged once in the change log. If the page looks wrong (too few teams, row counts that don't match the page, no SEC teams, or a sudden large drop), nothing is written and the skip is logged, so a bad read never wipes good data.

## 5. Step-by-Step Build Order

Feed these steps to your AI in order, one at a time, so each step fits in its context and the app is built piece by piece.

### Phase 1: Foundation & Database

1.  Initialize Next.js project with Tailwind CSS and Shadcn UI (for fast component building).
2.  Set up a Supabase project. Connect environment variables.
3.  Create the schema from Section 3 as Supabase migrations, including the validate_lineup() trigger.
4.  Set up Row Level Security (RLS) policies as described in 3.2.

### Phase 2: CFBD API & Data Pipelines

1.  Create a utility function to connect to the CFBD API.
2.  Build the pre-season setup script: seed SEC rosters into players, the schedule into games, and projections into player_season_projections.
3.  Build the weekly roster check as a Next.js API route. Set it up as a manual trigger for development testing.
4.  Build the salary generation API route using the pricing engine in 2.5. Set it up as a manual trigger for development testing.
5.  Build the stat-fetching script that parses CFBD game stats, including fumbles lost, into PPR fantasy points and updates lineup totals.

### Phase 3: Authentication & Navigation

1.  Implement Supabase Auth with Email/Password and Google OAuth. This means creating a Google Cloud OAuth client, adding its keys in Supabase, and setting the redirect URLs for local development and production.
2.  Create the onboarding flow so every signed-in user, whichever way they signed up, has a row in the profiles table with a chosen username.
3.  Build the global application shell (Navbar, Sidebar for mobile, User Dropdown).

### Phase 4: The Lineup Builder (Core Engine)

1.  Create the LineupBuilder React component.
2.  Fetch available players for the current week from player_weekly_stats joined with players and games (to get kickoff times).
3.  Implement client-side state (Zustand or React Context) to manage the draft board, tracking selected players and the 100-credit budget.
4.  Implement client-side validation to match the database trigger: budget of 100 or less, positions filled correctly, no duplicate players, and no changes to locked players.
5.  Create the Next.js Server Action to insert/update the lineups table, and show the trigger's error message if a save is rejected.

### Phase 5: Leagues & Leaderboards

1.  Build the "Create League" and "Join League" (via code) forms and Server Actions.
2.  Build the Global Leaderboard view from the lineups and profiles tables, refreshing during games.
3.  Build the Private League dashboard, ranking only users in that league's league_members rows.

### Phase 6: Admin Screen

1.  Build the /admin page, restricted to profiles with is_admin = true.
2.  Add player management: add a player by hand, edit, and deactivate.
3.  Add projection editing and weekly salary overrides.
4.  Show the change log (roster check results, unknown players found in box scores, admin actions) and buttons to run each pipeline manually.

### Phase 7: Final Polish & Deployment

1.  Finish the locked-player UI: kickoff countdowns, lock icons, and disabled slots once a player's game starts.
2.  Build the public "View User Roster" page, showing each opponent's picks as those players' games kick off.
3.  Finalize and deploy the cron jobs for the roster check, salary generation, live scoring and Monday reconciliation.
