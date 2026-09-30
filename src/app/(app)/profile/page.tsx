import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { requireProfile } from "@/lib/auth/dal";
import { loadMyRank, loadSchedule } from "@/lib/leaderboard/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile | SEC Gridiron 100" };

export default async function ProfilePage() {
  const { user, profile } = await requireProfile("/profile");
  const supabase = await createClient();
  const schedule = await loadSchedule(supabase, new Date());
  const season = schedule.season;
  const [{ data: lineups }, rank] = await Promise.all([
    supabase.from("lineups").select("total_score").eq("user_id", user.id).eq("season", season),
    loadMyRank(supabase, schedule, user.id),
  ]);
  const seasonPoints = (lineups ?? []).reduce((sum, l) => sum + Number(l.total_score ?? 0), 0);

  const stats = [
    { label: `${season} season points`, value: seasonPoints.toFixed(2) },
    { label: "Weeks played", value: String(lineups?.length ?? 0) },
    { label: "Global rank", value: rank ? `${rank.rank} of ${rank.total}` : "–" },
  ];

  return (
    <>
      <PageHeader eyebrow="Profile" title={profile.username} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5">
        {user.email && <p className="text-sm text-muted-foreground">{user.email}</p>}
        <Link
          href={`/users/${encodeURIComponent(profile.username)}`}
          className="mt-2 inline-block text-sm font-semibold text-primary hover:underline"
        >
          See your lineups week by week
        </Link>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-card p-4">
              <dt className="text-sm text-muted-foreground">{s.label}</dt>
              <dd className="mt-1 font-display text-4xl leading-none font-bold text-primary">{s.value}</dd>
            </div>
          ))}
        </dl>
      </main>
    </>
  );
}
