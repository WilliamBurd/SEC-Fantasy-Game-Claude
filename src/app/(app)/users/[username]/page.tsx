import { Lock, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HeaderFigure, PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/dal";
import { formatKickoff } from "@/lib/lineup/format";
import { loadRosterPage } from "@/lib/rosters/data";
import type { RosterSlot } from "@/lib/rosters/view";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/users/[username]">): Promise<Metadata> {
  const { username } = await params;
  return { title: `${decodeURIComponent(username)} | SEC Gridiron 100` };
}

/** Someone's lineups this season. Their picks show as each player's game kicks off. */
export default async function RosterPage({ params, searchParams }: PageProps<"/users/[username]">) {
  const { username: raw } = await params;
  const username = decodeURIComponent(raw);
  const { user } = await requireProfile(`/users/${raw}`);
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) notFound();

  const now = new Date();
  const page = await loadRosterPage(await createClient(), username, user.id, (await searchParams).week, now);
  if (!page) notFound();
  const base = `/users/${encodeURIComponent(page.username)}`;

  return (
    <>
      <PageHeader
        eyebrow={page.isOwner ? "Your roster" : `${page.season} season`}
        title={page.username}
        aside={<HeaderFigure value={page.seasonScore.toFixed(2)} label="season points" />}
        width="max-w-3xl"
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        <p className="text-sm text-muted-foreground">
          {page.rank ? `Ranked ${page.rank.rank} of ${page.rank.total} this season.` : "No lineups saved this season yet."}
          {!page.isOwner && " Picks appear as each player's game kicks off."}
        </p>

        {page.week === null ? null : (
          <>
            {page.weeks.length > 1 && (
              <nav aria-label="Week" className="-mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-1">
                {page.weeks.map((w) => (
                  <Link
                    key={w}
                    href={`${base}?week=${w}`}
                    scroll={false}
                    aria-current={w === page.week ? "page" : undefined}
                    className={cn(
                      "flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-semibold",
                      w === page.week ? "border-primary text-primary" : "border-input text-muted-foreground hover:bg-accent",
                    )}
                  >
                    Wk {w}
                  </Link>
                ))}
              </nav>
            )}

            <section aria-labelledby="week-heading" className="mt-4">
              <div className="flex items-end justify-between gap-3">
                <h2 id="week-heading" className="font-display text-2xl font-bold">
                  Week {page.week}
                </h2>
                <p className="text-sm text-muted-foreground">
                  <span className="font-display text-2xl font-bold text-primary">{page.weekScore.toFixed(2)}</span> pts
                </p>
              </div>
              <ul className="mt-3 flex flex-col gap-[7px]">
                {page.slots.map((slot) => (
                  <SlotRow key={slot.key} slot={slot} />
                ))}
              </ul>
              {page.isOwner && page.weekLive && (
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/lineup">
                    <Pencil /> Edit your lineup
                  </Link>
                </Button>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}

function SlotRow({ slot }: { slot: RosterSlot }) {
  const chip = cn(
    "flex size-[46px] shrink-0 items-center justify-center rounded-[9px] font-display font-extrabold",
    slot.label.length > 3 ? "text-base" : "text-lg",
  );
  if (slot.kind === "player") {
    const p = slot.player;
    return (
      <li className="flex items-center gap-3 rounded-xl bg-card p-2 pr-4 text-sm">
        <span className={cn(chip, "bg-primary text-primary-foreground")}>{slot.label}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold">{p.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {p.position} · {p.team} {p.home ? "vs" : "@"} {p.opponent}
          </span>
          <span className="block text-xs text-muted-foreground">
            {slot.locked ? "Kicked off" : formatKickoff(p.kickoffAt)}
          </span>
        </span>
        <span className="text-right">
          <span className="block font-display text-2xl leading-none font-bold text-primary">{p.points.toFixed(1)}</span>
          <span className="text-[11px] text-muted-foreground">pts</span>
        </span>
      </li>
    );
  }
  const text =
    slot.kind === "hidden" ? "Hidden until kickoff" : slot.kind === "empty" ? "Empty" : `Player ${slot.id} (no longer in the pool)`;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-locked p-2 text-sm text-muted-foreground">
      <span className={cn(chip, "bg-locked-chip")}>{slot.label}</span>
      <span className="flex flex-1 items-center gap-1.5">
        {slot.kind === "hidden" && <Lock className="size-3.5 text-primary" />}
        {text}
      </span>
    </li>
  );
}
