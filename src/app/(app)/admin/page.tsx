import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requireProfile } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Admin | SEC Gridiron 100" };

export default async function AdminPage() {
  const { profile } = await requireProfile("/admin");
  if (!profile.is_admin) notFound();
  return (
    <ComingSoon title="Admin">
      Player management, projections, salary overrides, the change log and manual pipeline runs will live here.
    </ComingSoon>
  );
}
