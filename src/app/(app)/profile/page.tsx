import type { Metadata } from "next";

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
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{profile.username}</h1>
      {user.email && <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>}
      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border p-4">
            <dt className="text-sm text-muted-foreground">{s.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
