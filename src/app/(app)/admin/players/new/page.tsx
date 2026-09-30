import type { Metadata } from "next";

import { PlayerForm } from "@/components/admin/admin-forms";
import { loadTeams } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add a player | SEC Gridiron 100" };

export default async function NewPlayerPage() {
  await requireAdmin("/admin/players/new");
  const teams = await loadTeams(await createClient());
  return (
    <section className="max-w-2xl rounded-xl bg-card p-4">
      <h2 className="font-display text-2xl font-bold">Add a player</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        For someone the roster check hasn&apos;t picked up. If you know their CFBD ID, enter it; otherwise they get a
        temporary ID, and once CFBD lists them the roster check flags the match so you can merge them.
      </p>
      <PlayerForm teams={teams} />
    </section>
  );
}
