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
- **Pricing tiers:** the tier system in 2.5 is a placeholder, to be redesigned in Phase 2.

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
- **Player Pool:** Active players on SEC teams that have a game that week. Players on a bye are not shown.
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

- **Prior Season PPG:** the player's fantasy points per game last season, from CFBD season stats. Transfers keep their stats from their previous school. This is empty for players with no college stats (for example, freshmen).
- **Preseason Projection:** an expected points-per-game figure for the coming season. It is set automatically from position, recruiting rating and last season's usage, and an admin can adjust it (see 2.7). This is the only input for freshmen, so it matters.
- **Current Season PPG:** the player's fantasy points per game this season, over games they have played.

**Week 1 prices**

- Returning players: Blended PPG = 60% Prior Season PPG + 40% Preseason Projection.
- Players with no previous college data: Blended PPG = 100% Preseason Projection.

**In-season prices (recalculated every Tuesday)**

- This season's weight grows with games played: Current Season weight = G / (G + 3), where G is the number of games the player has played this season. After 3 games, this season counts for 50%. After 9 games, it counts for 75%.
- The remaining weight is split between Prior Season PPG and Preseason Projection in the same 60/40 ratio as Week 1, or goes fully to the Preseason Projection for players with no previous college data. Last season always keeps some influence.
- All weights (60/40 and the "+3") are stored as configuration so they can be tuned without code changes.

**Blended PPG to salary** (placeholder, to be redesigned in Phase 2)

Rank every player in the week's pool with a Blended PPG of 2.0 or more, then assign tiers by rank. Players below 2.0 get the minimum price of 5 credits. Within each tier, the price is spread evenly from the top of the tier's range to the bottom.

- Tier 1 (Stars), top 10%: 25-30 credits
- Tier 2 (Starters), next 25%: 15-24 credits
- Tier 3 (Role Players), next 35%: 10-14 credits
- Tier 4 (Bargains), remaining 30%: 5-9 credits

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

### Data Pipelines

1.  **Pre-Season Setup (Run Once per Season):**
    - Endpoints: /roster, /games, /stats/player/season (previous season), /recruiting/players
    - Logic: Fetch rosters for all 16 SEC teams and populate the players table. Fetch the full SEC schedule with kickoff times into the games table. Calculate each player's Prior Season PPG and an automatic Preseason Projection into player_season_projections. Admins then review projections on the admin screen before Week 1 salaries are generated.
2.  **Tuesday Morning Weekly Roster Check (Cron: Weekly, runs first):**
    - Endpoints: /roster, /games
    - Logic: Re-fetch all 16 SEC rosters. Add new QB/RB/WR/TE players and create an automatic projection for them. Update the team for players who moved to another SEC team. Mark players no longer on any SEC roster as inactive; never delete them, because past lineups still point to them. Admin-added players are not deactivated by this check. Refresh kickoff times for upcoming games, since TV slots are often set during the season. Record every change in the change log for the admin screen.
3.  **Tuesday Morning Salary Generation (Cron: Weekly, runs after the roster check):**
    - Endpoint: /stats/player/season (current season)
    - Logic: For every active player whose team plays that week, calculate Current Season PPG and Blended PPG using the pricing engine in 2.5. Assign salaries and create player_weekly_stats rows for the upcoming week.
4.  **Game Day Live Scoring (Cron: Every 5-10 mins while any SEC game is in progress):**
    - Endpoint: /games/players
    - Logic: The job runs on a schedule but does nothing unless a game in the games table has kicked off and isn't final, so Thursday, Friday and Saturday games are all covered. Fetch stats for in-progress games and store passing, rushing, receiving, interception and fumbles-lost numbers on each player's weekly row. Calculate PPR fantasy_points (Section 2.3). Update game status. Then recalculate total_score for every lineup that week, so leaderboards update live.
    - If a player records stats but isn't in the players table, log it in the change log so an admin can add them on the admin screen.
    - Note: Vercel's Hobby plan runs cron jobs only once a day. Frequent scoring needs a Vercel Pro plan or Supabase pg_cron.
5.  **Monday Final Reconciliation (Cron: Weekly):**
    - Logic: Re-fetch final stats for all of the week's games to pick up stat corrections. Recalculate fantasy_points and every lineup's total_score, then mark the week final.

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
