import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requireProfile } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Leaderboard | SEC Gridiron 100" };

export default async function LeaderboardPage() {
  await requireProfile("/leaderboard");
  return (
    <ComingSoon title="Leaderboard">
      Weekly and season rankings for every player will appear here, updating live during games.
    </ComingSoon>
  );
}
