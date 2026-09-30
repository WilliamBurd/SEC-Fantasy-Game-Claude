import { ChevronRight, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CreateLeagueForm, JoinLeagueForm } from "@/components/leagues/league-forms";
import { requireProfile } from "@/lib/auth/dal";
import { listMyLeagues } from "@/lib/leagues/data";
import { normalizeInviteCode } from "@/lib/leagues/validation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Leagues | SEC Gridiron 100" };

export default async function LeaguesPage({ searchParams }: PageProps<"/leagues">) {
  const { user } = await requireProfile("/leagues");
  const params = await searchParams;
  const invite = normalizeInviteCode(params.join);
  const code = "code" in invite ? invite.code : undefined;
  const leagues = await listMyLeagues(await createClient(), user.id);

  const join = (
    <section key="join" className="rounded-xl border p-4">
      <h2 className="font-semibold">Join a league</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {code ? "You've been invited. Check the code and join." : "Got an invite code from a friend? Enter it here."}
      </p>
      <div className="mt-3">
        <JoinLeagueForm code={code} />
      </div>
    </section>
  );
  const create = (
    <section key="create" className="rounded-xl border p-4">
      <h2 className="font-semibold">Create a league</h2>
      <p className="mt-1 text-sm text-muted-foreground">You&apos;ll get a 6-character invite code to share.</p>
      <div className="mt-3">
        <CreateLeagueForm />
      </div>
    </section>
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Leagues</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Play against friends: everyone picks their own lineup each week, and the league ranks you by week and season.
      </p>

      <section aria-labelledby="my-leagues" className="mt-6">
        <h2 id="my-leagues" className="text-lg font-semibold">
          Your leagues
        </h2>
        {leagues.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            You&apos;re not in any leagues yet. Create one or join with a code below.
          </p>
        ) : (
          <ul className="mt-2 divide-y rounded-xl border">
            {leagues.map((league) => (
              <li key={league.id}>
                <Link href={`/leagues/${league.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{league.name}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3" /> {league.members} {league.members === 1 ? "member" : "members"}
                      {league.isAdmin && " · You created it"}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">{code ? [join, create] : [create, join]}</div>
    </main>
  );
}
