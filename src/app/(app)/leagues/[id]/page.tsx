import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/leaderboard/auto-refresh";
import { BoardControls, rosterHref, Standings } from "@/components/leaderboard/standings";
import { InviteShare, LeaveOrDeleteLeague, RenameLeagueForm } from "@/components/leagues/league-forms";
import { HeaderFigure, PageHeader } from "@/components/shell/page-header";
import { requireProfile } from "@/lib/auth/dal";
import { loadBoard, loadSchedule } from "@/lib/leaderboard/data";
import { pickBoardWeek, pickView } from "@/lib/leaderboard/weeks";
import { getLeague } from "@/lib/leagues/data";
import { isUuid } from "@/lib/leagues/validation";
import { formatKickoff } from "@/lib/lineup/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "League | SEC Gridiron 100" };

// Leagues are small; this shows every member.
const MAX_MEMBERS = 1000;

export default async function LeaguePage({ params, searchParams }: PageProps<"/leagues/[id]">) {
  const { id } = await params;
  const { user } = await requireProfile(`/leagues/${id}`);
  if (!isUuid(id)) notFound();

  const query = await searchParams;
  const now = new Date();
  const db = await createClient();
  const [league, schedule] = await Promise.all([getLeague(db, id, user.id), loadSchedule(db, now)]);
  if (!league) notFound();

  const week = pickBoardWeek(schedule.weeks, query.week);
  const view = pickView(query.view);
  // Before the first week kicks off everyone has 0; the board still lists the members.
  const board = await loadBoard(db, { schedule, week: week ?? 0, view, userId: user.id, leagueId: id, limit: MAX_MEMBERS, now });

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/leagues" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="size-3.5" /> Leagues
          </Link>
        }
        title={league.name}
        aside={<HeaderFigure value={league.members} label={league.members === 1 ? "member" : "members"} />}
        width="max-w-3xl"
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        <p className="text-sm text-muted-foreground">
          Invite friends with this code:
        </p>
        <div className="mt-2">
          <InviteShare code={league.inviteCode} leagueName={league.name} />
        </div>

        <section aria-labelledby="standings" className="mt-8">
          <h2 id="standings" className="font-display text-2xl font-bold">
            Standings
          </h2>
          {week === null ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {schedule.startsAt
                  ? `Rankings start when Week ${schedule.startsAt.week} kicks off (${formatKickoff(schedule.startsAt.kickoffAt)}).`
                  : "There are no games left this season."}
              </p>
              <ul className="mt-3 divide-y overflow-hidden rounded-xl bg-card text-sm">
                {[...board.rows].sort((a, b) => a.username.localeCompare(b.username)).map((row) => (
                  <li key={row.userId} className="px-3 py-2.5 font-semibold">
                    <Link href={rosterHref(row.username)} className="hover:text-primary hover:underline">
                      {row.username}
                    </Link>
                    {row.userId === user.id && <span className="ml-1.5 text-xs text-primary">You</span>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="mt-2">
                <AutoRefresh live={board.live} />
              </div>
              <div className="mt-3">
                <BoardControls basePath={`/leagues/${id}`} weeks={schedule.weeks} week={week} view={view} />
              </div>
              <div className="mt-4">
                <Standings board={board} week={week} view={view} userId={user.id} empty="No members yet." />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Members without a lineup that week score 0. Ties share a rank.</p>
            </>
          )}
        </section>

        <section aria-labelledby="settings" className="mt-10 flex flex-col gap-4 border-t pt-6">
          <h2 id="settings" className="font-display text-2xl font-bold">
            {league.isAdmin ? "Manage league" : "Membership"}
          </h2>
          {league.isAdmin && <RenameLeagueForm leagueId={id} name={league.name} />}
          <LeaveOrDeleteLeague leagueId={id} isAdmin={league.isAdmin} />
        </section>
      </main>
    </>
  );
}
