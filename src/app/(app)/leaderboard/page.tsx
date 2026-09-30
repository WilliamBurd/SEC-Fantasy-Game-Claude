import type { Metadata } from "next";

import { AutoRefresh } from "@/components/leaderboard/auto-refresh";
import { BoardControls, Standings } from "@/components/leaderboard/standings";
import { requireProfile } from "@/lib/auth/dal";
import { loadBoard, loadSchedule, type BoardSchedule } from "@/lib/leaderboard/data";
import { pickBoardWeek, pickView, type BoardView } from "@/lib/leaderboard/weeks";
import { formatKickoff } from "@/lib/lineup/format";
import type { Db } from "@/lib/pipelines/db";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Leaderboard | SEC Gridiron 100" };

const TOP = 100;

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const { user } = await requireProfile("/leaderboard");
  const params = await searchParams;
  const now = new Date();
  const db = await createClient();
  const schedule = await loadSchedule(db, now);
  const week = pickBoardWeek(schedule.weeks, params.week);
  const view = pickView(params.view);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
      {week === null ? (
        <p className="mt-4 rounded-xl border border-dashed p-6 text-muted-foreground">
          {schedule.startsAt
            ? `The leaderboard starts when Week ${schedule.startsAt.week} kicks off (${formatKickoff(schedule.startsAt.kickoffAt)}).`
            : `There are no SEC games left in the ${schedule.season} season.`}
        </p>
      ) : (
        <Board week={week} view={view} weeks={schedule.weeks} userId={user.id} schedule={schedule} now={now} db={db} />
      )}
    </main>
  );
}

async function Board({
  week,
  view,
  weeks,
  userId,
  schedule,
  now,
  db,
}: {
  week: number;
  view: BoardView;
  weeks: number[];
  userId: string;
  schedule: BoardSchedule;
  now: Date;
  db: Db;
}) {
  const board = await loadBoard(db, { schedule, week, view, userId, limit: TOP, now });
  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">
        Everyone who has saved a {schedule.season} lineup, ranked by {view === "week" ? `Week ${week} points` : "season points"}.
        {board.total > TOP && ` Showing the top ${TOP} of ${board.total}.`}
      </p>
      <div className="mt-2">
        <AutoRefresh live={board.live} />
      </div>
      <div className="mt-4">
        <BoardControls basePath="/leaderboard" weeks={weeks} week={week} view={view} />
      </div>
      <div className="mt-4">
        <Standings
          board={board}
          week={week}
          view={view}
          userId={userId}
          empty="Nobody has saved a lineup yet this season. Be the first on the board."
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Scores count each player once their game has been scored. Ties share a rank.
      </p>
    </>
  );
}
