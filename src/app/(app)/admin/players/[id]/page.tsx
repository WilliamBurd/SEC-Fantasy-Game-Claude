import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { MergeForm, PlayerForm, ProjectionForm, SalaryForm } from "@/components/admin/admin-forms";
import { ChangeLogList } from "@/components/admin/change-log-list";
import { FormMessage } from "@/components/auth/form-message";
import { getPlayerDetail, loadTeams } from "@/lib/admin/data";
import { parsePlayerId } from "@/lib/admin/forms";
import { requireAdmin } from "@/lib/auth/dal";
import { formatPpg } from "@/lib/lineup/format";
import { seasonFor } from "@/lib/pipelines/season";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Player | SEC Gridiron 100" };

export default async function AdminPlayerPage({ params, searchParams }: PageProps<"/admin/players/[id]">) {
  const { id: raw } = await params;
  await requireAdmin(`/admin/players/${raw}`);
  const id = parsePlayerId(raw);
  if (id === null) notFound();

  const query = await searchParams;
  const now = new Date();
  const season = seasonFor(now);
  const db = await createClient();
  const [player, teams] = await Promise.all([getPlayerDetail(db, id, season, now), loadTeams(db)]);
  if (!player) notFound();
  const temporary = player.id < 0;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Players
      </Link>
      <div>
        <h2 className="font-display text-3xl font-bold">
          {player.firstName} {player.lastName}
        </h2>
        <p className="text-sm text-muted-foreground">
          {player.position} · {player.team} · {temporary ? `temporary ID ${player.id}` : `CFBD ID ${player.id}`}
          {player.source === "admin" && " · added by hand"}
          {!player.active && (player.deactivatedByAdmin ? " · deactivated by an admin" : " · inactive (off the roster)")}
        </p>
      </div>
      {query.added === "1" && <FormMessage message="Player added." />}
      {query.merged === "1" && <FormMessage message="Merged: this player now holds the temporary player's upcoming weeks." />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Details">
          {player.source === "cfbd" && (
            <p className="mb-3 text-xs text-muted-foreground">
              The Tuesday roster check refreshes name, team and position from CFBD. A player you deactivate stays inactive.
            </p>
          )}
          <PlayerForm
            teams={teams}
            player={{
              id: player.id,
              firstName: player.firstName,
              lastName: player.lastName,
              team: player.team,
              position: player.position,
              classYear: player.classYear,
              active: player.active,
            }}
          />
        </Section>

        <div className="flex flex-col gap-4">
          <Section title={`${season} projection`}>
            <p className="mb-3 text-xs text-muted-foreground">
              {player.projection
                ? player.projection.source === "admin"
                  ? "Set by an admin. The pre-season setup keeps it."
                  : "Automatic. Saving here marks it as yours, so the pre-season setup keeps it."
                : "No projection yet."}{" "}
              Pricing blends it with real games as the season goes on.
            </p>
            <ProjectionForm
              playerId={player.id}
              projectedPpg={player.projection?.projectedPpg ?? null}
              priorSeasonPpg={player.projection?.priorSeasonPpg ?? null}
            />
          </Section>

          {temporary && (
            <Section title="Match to CFBD">
              <p className="mb-3 text-xs text-muted-foreground">
                Once CFBD lists this player, merge them: their upcoming weeks (price and places in saved lineups) move to
                the CFBD player, and this temporary one is retired. Weeks already under way stay here.
              </p>
              {player.possibleMatches.length > 0 && (
                <p className="mb-3 text-sm">
                  The roster check thinks this is{" "}
                  {player.possibleMatches.map((m, i) => (
                    <span key={m.cfbdId}>
                      {i > 0 && " or "}
                      <Link href={`/admin/players/${m.cfbdId}`} className="font-semibold text-primary hover:underline">
                        {m.name} (CFBD {m.cfbdId})
                      </Link>
                    </span>
                  ))}
                  .
                </p>
              )}
              <MergeForm playerId={player.id} suggested={player.possibleMatches[0]?.cfbdId ?? null} />
            </Section>
          )}
        </div>
      </div>

      <Section title="Weekly prices">
        <p className="mb-3 text-xs text-muted-foreground">
          An override is kept by the Tuesday pricing run. Allowed until the week&apos;s first kickoff. Saved lineups stay
          as they are; anyone pushed over 100 credits has to make room before their next change.
        </p>
        {player.weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not priced this season.</p>
        ) : (
          <ul className="divide-y">
            {player.weeks.map((w) => (
              <li key={w.week} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-semibold">
                    Week {w.week} <span className="font-normal text-muted-foreground">{w.opponent}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {w.salary === null
                      ? "Not in this week's pool"
                      : `${w.salary} credits${w.overridden ? " (override)" : ""} · ${formatPpg(w.blendedPpg)} blended PPG`}
                    {w.closed && ` · ${w.points.toFixed(1)} pts`}
                  </p>
                </div>
                {w.closed ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="size-3.5 text-primary" /> Week kicked off
                  </span>
                ) : (
                  <SalaryForm playerId={player.id} week={w.week} salary={w.salary} overridden={w.overridden} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="History">
        <ChangeLogList rows={player.log} linkPlayers={false} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-card p-4">
      <h3 className="mb-2 font-display text-2xl font-bold">{title}</h3>
      {children}
    </section>
  );
}
