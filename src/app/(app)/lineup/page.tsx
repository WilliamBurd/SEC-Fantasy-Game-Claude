import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requireProfile } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Lineup | SEC Gridiron 100" };

export default async function LineupPage() {
  await requireProfile("/lineup");
  return (
    <ComingSoon title="Your lineup">
      The lineup builder is on its way. You&apos;ll pick a QB, two RBs, two WRs, a TE and a FLEX under the
      100-credit cap, and each player locks when their game kicks off.
    </ComingSoon>
  );
}
