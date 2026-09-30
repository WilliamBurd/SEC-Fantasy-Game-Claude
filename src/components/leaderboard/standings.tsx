import Link from "next/link";

import type { Board, BoardRow } from "@/lib/leaderboard/data";
import type { BoardView } from "@/lib/leaderboard/weeks";
import { cn } from "@/lib/utils";

/** Each username links to that player's roster page. */
export const rosterHref = (username: string) => `/users/${encodeURIComponent(username)}`;

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
};

/**
 * The rankings shared by the global leaderboard and league pages: the top
 * three on a podium, then a table of everyone else (plus the signed-in
 * user's own row when they're further down).
 */
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
    return <p className="rounded-xl border border-dashed border-input p-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  const podium = board.rows.length >= 3 ? board.rows.slice(0, 3) : [];
  const rest = board.rows.slice(podium.length);

  return (
    <div className="flex flex-col gap-3">
      {podium.length > 0 && <Podium rows={podium} view={view} userId={userId} />}
      {(rest.length > 0 || board.me) && (
        <div className="overflow-hidden rounded-xl bg-card">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="w-14 px-3 py-2.5 text-left font-semibold">
                  Rank
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                  Player
                </th>
                <th scope="col" className={cn("px-3 py-2.5 text-right font-semibold", view === "week" ? "text-foreground" : "hidden sm:table-cell")}>
                  Week {week}
                </th>
                <th scope="col" className={cn("px-3 py-2.5 text-right font-semibold", view === "season" ? "text-foreground" : "hidden sm:table-cell")}>
                  Season
                </th>
              </tr>
            </thead>
            <tbody className="divide-y border-t">
              {rest.map((row) => (
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
      )}
    </div>
  );
}

/** 2nd, 1st, 3rd side by side, 1st raised and outlined in gold. */
function Podium({ rows, view, userId }: { rows: BoardRow[]; view: BoardView; userId: string }) {
  const [first, second, third] = rows;
  const place = (row: BoardRow, spot: 1 | 2 | 3) => {
    const rank = view === "week" ? row.weekRank : row.seasonRank;
    const score = view === "week" ? row.weekScore : row.seasonScore;
    return (
      <li
        key={row.userId}
        className={cn(
          "flex min-w-0 flex-col items-center gap-0.5 rounded-xl bg-card px-1.5 text-center",
          spot === 1 ? "order-2 border-2 border-primary py-4" : spot === 2 ? "order-1 py-3" : "order-3 py-2.5",
        )}
      >
        <span
          className={cn(
            "font-display leading-none font-extrabold",
            spot === 1 ? "text-[28px] text-primary" : spot === 2 ? "text-[22px] text-foreground/80" : "text-xl text-[#c9a36a]",
          )}
        >
          {ordinal(rank)}
        </span>
        <Link href={rosterHref(row.username)} className="w-full truncate text-xs font-bold hover:text-primary hover:underline">
          {row.username}
        </Link>
        {row.userId === userId && <span className="text-[10px] font-semibold text-primary">You</span>}
        <span className={cn("font-display font-bold", spot === 1 ? "text-[22px]" : "text-xl")}>{score.toFixed(2)}</span>
      </li>
    );
  };
  return (
    <ol aria-label="Top three" className="grid grid-cols-3 items-end gap-1.5">
      {place(first, 1)}
      {place(second, 2)}
      {place(third, 3)}
    </ol>
  );
}

function Row({ row, view, mine }: { row: BoardRow; view: BoardView; mine: boolean }) {
  const rank = view === "week" ? row.weekRank : row.seasonRank;
  return (
    <tr className={cn(mine && "bg-accent")}>
      <td className="px-3 py-2.5 font-display text-xl font-bold text-muted-foreground">{rank}</td>
      <td className="px-3 py-2.5 font-semibold break-all">
        <Link href={rosterHref(row.username)} className="hover:text-primary hover:underline">
          {row.username}
        </Link>
        {mine && <span className="ml-1.5 text-xs font-semibold text-primary">You</span>}
      </td>
      <td className={cn("px-3 py-2.5 text-right font-display text-xl", view === "week" ? "font-bold" : "hidden text-muted-foreground sm:table-cell")}>
        {row.weekScore.toFixed(2)}
      </td>
      <td className={cn("px-3 py-2.5 text-right font-display text-xl", view === "season" ? "font-bold" : "hidden text-muted-foreground sm:table-cell")}>
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
      "flex h-[38px] flex-1 items-center justify-center rounded-[9px] text-sm transition-colors",
      active ? "bg-primary font-extrabold text-primary-foreground" : "font-semibold text-muted-foreground hover:text-foreground",
    );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex w-full rounded-xl bg-card p-1 sm:w-72" role="tablist" aria-label="Ranking">
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
                "flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-semibold transition-colors",
                w === week ? "border-primary text-primary" : "border-input text-muted-foreground hover:bg-accent",
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
