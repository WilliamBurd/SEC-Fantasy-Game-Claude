import Link from "next/link";

import { describeChange } from "@/lib/admin/change-log";
import type { LogRow } from "@/lib/admin/data";
import { formatTimestamp } from "@/lib/lineup/format";

/** Change log entries in plain English, newest first. */
export function ChangeLogList({ rows, linkPlayers = true }: { rows: LogRow[]; linkPlayers?: boolean }) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed border-input p-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>;
  }
  return (
    <ul className="divide-y overflow-hidden rounded-xl bg-card">
      {rows.map((row) => {
        const { title, detail } = describeChange(row);
        return (
          <li key={row.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm">
            <span className="font-semibold">
              {linkPlayers && row.playerId !== null ? (
                <Link href={`/admin/players/${row.playerId}`} className="hover:underline">
                  {title}
                </Link>
              ) : (
                title
              )}
            </span>
            {detail && <span className="text-xs break-words text-muted-foreground">{detail}</span>}
            <span className="text-xs text-muted-foreground">
              {formatTimestamp(row.createdAt)} · {row.by ? <span className="text-primary">{row.by}</span> : "automatic"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
