import type { Metadata } from "next";

import { LineupBuilder } from "@/components/lineup/lineup-builder";
import { requireProfile } from "@/lib/auth/dal";
import { loadLineupPage } from "@/lib/lineup/data";
import { formatDay } from "@/lib/lineup/format";
import type { UpcomingWeek } from "@/lib/lineup/week";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lineup | SEC Gridiron 100" };

export default async function LineupPage() {
  const { user } = await requireProfile("/lineup");
  const now = new Date();
  const data = await loadLineupPage(await createClient(), user.id, now);
  const { status } = data;

  if (status.kind === "none") {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Your lineup</h1>
        <p className="mt-4 max-w-prose rounded-xl border border-dashed p-6 text-muted-foreground">
          {status.next ? opensMessage(status.next) : `There are no more SEC games in the ${data.season} season.`}
        </p>
      </main>
    );
  }

  return (
    <LineupBuilder
      season={data.season}
      week={status.week}
      readOnly={status.kind === "finished"}
      nextWeekMessage={status.kind === "finished" ? (status.next ? opensMessage(status.next) : "That was the last week of the season.") : null}
      players={data.players}
      saved={data.saved}
      hasLineup={data.hasLineup}
      totalScore={data.totalScore}
      serverNow={now.toISOString()}
    />
  );
}

function opensMessage(next: UpcomingWeek): string {
  return next.opensAt
    ? `Week ${next.week} opens ${formatDay(next.opensAt)} morning, once its prices are set.`
    : `Week ${next.week}'s prices are being set now. Check back shortly.`;
}
