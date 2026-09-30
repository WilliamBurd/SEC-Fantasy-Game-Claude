import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requireProfile } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Leagues | SEC Gridiron 100" };

export default async function LeaguesPage() {
  await requireProfile("/leagues");
  return (
    <ComingSoon title="Leagues">
      Create a private league with an invite code, or join a friend&apos;s, and compare scores each week.
    </ComingSoon>
  );
}
