import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listPlayers, PAGE_SIZE, pickStatus, type PlayerStatus } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/auth/dal";
import { seasonFor } from "@/lib/pipelines/season";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin | SEC Gridiron 100" };

const STATUSES: { value: PlayerStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "hand-added", label: "Added by hand" },
];

/** Players: search, filter and open one to edit. */
export default async function AdminPlayersPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin("/admin");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 60) : "";
  const status = pickStatus(params.status);
  const page = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);
  const season = seasonFor(new Date());
  const { rows, total } = await listPlayers(await createClient(), { season, q, status, page });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (overrides: Record<string, string | number>) => {
    const sp = new URLSearchParams({ ...(q ? { q } : {}), status, page: String(page), ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])) });
    return `/admin?${sp}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form action="/admin" className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
          <input type="hidden" name="status" value={status} />
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" type="search" defaultValue={q} placeholder="Name or team" aria-label="Search players" className="pl-8" />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button asChild>
          <Link href="/admin/players/new">
            <Plus /> Add player
          </Link>
        </Button>
      </div>

      <nav aria-label="Status" className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={href({ status: s.value, page: 1 })}
            aria-current={s.value === status ? "page" : undefined}
            className={cn(
              "flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-semibold",
              s.value === status ? "border-primary text-primary" : "border-input text-muted-foreground hover:bg-accent",
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      <p className="text-xs text-muted-foreground">
        {total} {total === 1 ? "player" : "players"}
        {pages > 1 && ` · page ${page} of ${pages}`}
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-input p-6 text-center text-sm text-muted-foreground">No players match.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl bg-card">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/players/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent">
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate font-bold", !p.active && "text-muted-foreground line-through")}>{p.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.position} · {p.team} · ID {p.id}
                    {p.source === "admin" && <span className="text-primary"> · added by hand</span>}
                  </span>
                </span>
                <span className="text-right text-xs text-muted-foreground">
                  <span className="block font-display text-lg leading-none font-bold text-foreground">
                    {p.projectedPpg === null ? "–" : p.projectedPpg.toFixed(1)}
                  </span>
                  proj. PPG{p.projectionSource === "admin" && " (set)"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex justify-between">
          <Button asChild variant="outline" size="sm" className={cn(page <= 1 && "invisible")}>
            <Link href={href({ page: page - 1 })}>Previous</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className={cn(page >= pages && "invisible")}>
            <Link href={href({ page: page + 1 })}>Next</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
