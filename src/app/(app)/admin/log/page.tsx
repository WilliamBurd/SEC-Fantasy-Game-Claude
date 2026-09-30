import type { Metadata } from "next";
import Link from "next/link";

import { ChangeLogList } from "@/components/admin/change-log-list";
import { Button } from "@/components/ui/button";
import { LOG_FILTERS, pickLogFilter, type LogFilter } from "@/lib/admin/change-log";
import { listChangeLog, PAGE_SIZE } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Change log | SEC Gridiron 100" };

/** Everything the jobs and admins changed, newest first; "Roster changes" is the weekly roster check's review. */
export default async function ChangeLogPage({ searchParams }: PageProps<"/admin/log">) {
  await requireAdmin("/admin/log");
  const params = await searchParams;
  const filter = pickLogFilter(params.filter);
  const page = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);
  const { rows, total } = await listChangeLog(await createClient(), { filter, page });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (f: LogFilter, p: number) => `/admin/log?filter=${f}&page=${p}`;

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Filter" className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {(Object.keys(LOG_FILTERS) as LogFilter[]).map((f) => (
          <Link
            key={f}
            href={href(f, 1)}
            aria-current={f === filter ? "page" : undefined}
            className={cn(
              "flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-semibold",
              f === filter ? "border-primary text-primary" : "border-input text-muted-foreground hover:bg-accent",
            )}
          >
            {LOG_FILTERS[f].label}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-muted-foreground">
        {total} {total === 1 ? "entry" : "entries"}
        {pages > 1 && ` · page ${page} of ${pages}`}
      </p>
      <ChangeLogList rows={rows} />
      {pages > 1 && (
        <div className="flex justify-between">
          <Button asChild variant="outline" size="sm" className={cn(page <= 1 && "invisible")}>
            <Link href={href(filter, page - 1)}>Newer</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className={cn(page >= pages && "invisible")}>
            <Link href={href(filter, page + 1)}>Older</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
