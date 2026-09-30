import Link from "next/link";

import type { Board, BoardRow } from "@/lib/leaderboard/data";
import type { BoardView } from "@/lib/leaderboard/weeks";
import { cn } from "@/lib/utils";

/** The ranking table shared by the global leaderboard and league pages. */
export function Standings({
  board,
  week,
  view,
  userId,
  empty,
}: {
  board: Board;
  week: number;
  view: BoardView;
  userId: string;
  empty: string;
}) {
  if (board.rows.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-14 px-3 py-2 text-left font-medium">
              Rank
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Player
            </th>
            <th scope="col" className={cn("px-3 py-2 text-right font-medium", view === "week" && "text-foreground")}>
              Week {week}
            </th>
            <th scope="col" className={cn("px-3 py-2 text-right font-medium", view === "season" && "text-foreground")}>
              Season
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {board.rows.map((row) => (
            <Row key={row.userId} row={row} view={view} mine={row.userId === userId} />
          ))}
          {board.me && (
            <>
              <tr aria-hidden>
                <td colSpan={4} className="px-3 py-1 text-center text-xs text-muted-foreground">
                  ···
                </td>
              </tr>
              <Row row={board.me} view={view} mine />
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row, view, mine }: { row: BoardRow; view: BoardView; mine: boolean }) {
  const rank = view === "week" ? row.weekRank : row.seasonRank;
  return (
    <tr className={cn(mine && "bg-accent font-medium")}>
      <td className="px-3 py-2.5 tabular-nums">{rank}</td>
      <td className="max-w-0 truncate px-3 py-2.5">
        {row.username}
        {mine && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
      </td>
      <td className={cn("px-3 py-2.5 text-right tabular-nums", view === "week" ? "font-semibold" : "text-muted-foreground")}>
        {row.weekScore.toFixed(2)}
      </td>
      <td className={cn("px-3 py-2.5 text-right tabular-nums", view === "season" ? "font-semibold" : "text-muted-foreground")}>
        {row.seasonScore.toFixed(2)}
      </td>
    </tr>
  );
}

/** Season / Week N switch and a week picker, as plain links (`?view=&week=`). */
export function BoardControls({
  basePath,
  weeks,
  week,
  view,
}: {
  basePath: string;
  weeks: number[];
  week: number;
  view: BoardView;
}) {
  const href = (v: BoardView, w: number) => `${basePath}?view=${v}&week=${w}`;
  const tab = (active: boolean) =>
    cn(
      "flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors",
      active ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex w-fit rounded-lg bg-muted p-1" role="tablist" aria-label="Ranking">
        <Link href={href("season", week)} role="tab" aria-selected={view === "season"} className={tab(view === "season")} scroll={false}>
          Season
        </Link>
        <Link href={href("week", week)} role="tab" aria-selected={view === "week"} className={tab(view === "week")} scroll={false}>
          Week {week}
        </Link>
      </div>
      {weeks.length > 1 && (
        <nav aria-label="Week" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {weeks.map((w) => (
            <Link
              key={w}
              href={href(view, w)}
              scroll={false}
              aria-current={w === week ? "page" : undefined}
              className={cn(
                "flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                w === week ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              Wk {w}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
