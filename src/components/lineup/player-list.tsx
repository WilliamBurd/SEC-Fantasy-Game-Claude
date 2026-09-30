"use client";

import { Check, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPpg } from "@/lib/lineup/format";
import { SORT_LABELS, filterPool, teamsInPool, type PoolFilters, type PoolSort, type PositionFilter } from "@/lib/lineup/pool";
import { isLocked, slotByKey, slotOf, type AddResult, type LineupSlots, type PoolPlayer, type SlotKey } from "@/lib/lineup/rules";
import { cn } from "@/lib/utils";

import { InjuryBadge, Kickoff, injuryText, matchup } from "./player-details";

const POSITIONS: PositionFilter[] = ["ALL", "QB", "RB", "WR", "TE", "FLEX"];
const MAX_SALARIES = [5, 8, 10, 15, 20, 25];
const PAGE = 50;

type Props = {
  players: PoolPlayer[];
  filters: PoolFilters;
  onFilters: (filters: Partial<PoolFilters>) => void;
  /** The slot being filled, when the user picked one ("RB2"). */
  target: string | null;
  onCancelTarget: () => void;
  draft: LineupSlots;
  check: (player: PoolPlayer) => AddResult;
  onAdd: (player: PoolPlayer) => void;
  onRemove: (slot: SlotKey) => void;
  canEditSlot: (slot: SlotKey) => boolean;
  now: Date;
  readOnly: boolean;
  showPoints: boolean;
};

const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

/** The week's player pool, with search, filters and sorting. */
export function PlayerList(props: Props) {
  const { players, filters, onFilters, now, readOnly, showPoints } = props;
  const [limit, setLimit] = useState(PAGE);
  const teams = useMemo(() => teamsInPool(players), [players]);
  const shown = filterPool(players, filters, now, { lockedLast: !readOnly });
  const visible = shown.slice(0, limit);

  const setFilters = (f: Partial<PoolFilters>) => {
    onFilters(f);
    setLimit(PAGE);
  };
  const sorts = (Object.keys(SORT_LABELS) as PoolSort[]).filter((s) => s !== "points" || showPoints);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="players-heading" className="text-lg font-semibold">
          Players
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {shown.length} of {players.length}
        </span>
      </div>

      {props.target && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-primary bg-accent px-3 py-2 text-sm">
          <span>
            Choosing for <strong>{props.target}</strong>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={props.onCancelTarget}>
            Cancel
          </Button>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search players or teams"
            aria-label="Search players or teams"
            className="pl-8"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
          />
        </div>

        <div role="group" aria-label="Position" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              type="button"
              aria-pressed={filters.position === pos}
              onClick={() => setFilters({ position: pos })}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-sm font-medium transition-colors",
                filters.position === pos ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {pos === "ALL" ? "All" : pos}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Team
            <select className={selectClass} value={filters.team} onChange={(e) => setFilters({ team: e.target.value })}>
              <option value="ALL">All teams</option>
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Max salary
            <select
              className={selectClass}
              value={filters.maxSalary ?? ""}
              onChange={(e) => setFilters({ maxSalary: e.target.value === "" ? null : Number(e.target.value) })}
            >
              <option value="">Any</option>
              {MAX_SALARIES.map((s) => (
                <option key={s} value={s}>
                  {s} or less
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-1">
            Sort by
            <select className={selectClass} value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as PoolSort })}>
              {sorts.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={filters.hideNoPoints}
            onChange={(e) => setFilters({ hideNoPoints: e.target.checked })}
          />
          Hide players with no points (0 Blended PPG)
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No players match. Try clearing the search or filters.
        </p>
      ) : (
        <ul className="mt-3 divide-y rounded-xl border">
          {visible.map((player) => (
            <PlayerRow key={player.id} player={player} {...props} />
          ))}
        </ul>
      )}

      {shown.length > visible.length && (
        <Button type="button" variant="outline" className="mt-3 w-full" onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, shown.length - visible.length)} more
        </Button>
      )}
    </div>
  );
}

function PlayerRow({ player, draft, check, onAdd, onRemove, canEditSlot, now, readOnly, showPoints }: Props & { player: PoolPlayer }) {
  const locked = isLocked(player, now);
  const inSlot = slotOf(draft, player.id);
  const result = inSlot || readOnly ? null : check(player);
  const injury = injuryText(player.injury);

  let action;
  if (inSlot) {
    action = canEditSlot(inSlot) ? (
      <Button type="button" variant="outline" size="sm" className="gap-1 px-2" onClick={() => onRemove(inSlot)} aria-label={`Remove ${player.name} from ${slotByKey(inSlot).label}`}>
        {slotByKey(inSlot).label}
        <X className="text-muted-foreground" />
      </Button>
    ) : (
      <span className="flex items-center gap-1 text-xs font-medium">
        <Check className="size-3.5" /> {slotByKey(inSlot).label}
      </span>
    );
  } else if (result?.ok) {
    action = (
      <Button type="button" size="icon" onClick={() => onAdd(player)} aria-label={`Add ${player.name} (${player.salary} credits)`}>
        <Plus />
      </Button>
    );
  } else if (result && !locked) {
    action = <span className="text-right text-[11px] leading-tight text-muted-foreground">{result.reason}</span>;
  }

  return (
    <li className={cn("flex items-center gap-3 px-3 py-2.5 text-sm", inSlot && "bg-accent/60", locked && !readOnly && "opacity-70")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{player.name}</span>
          <InjuryBadge injury={player.injury} />
        </div>
        <div className="truncate text-xs text-muted-foreground">{matchup(player)}</div>
        <div className="text-xs text-muted-foreground">
          <Kickoff player={player} locked={locked} />
        </div>
        {injury && <div className="truncate text-xs text-muted-foreground">{injury}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end text-right">
        <span className="font-semibold tabular-nums">{player.salary}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{formatPpg(player.blendedPpg)} PPG</span>
        {showPoints && locked && <span className="text-[11px] font-medium tabular-nums">{player.weekPoints.toFixed(1)} pts</span>}
      </div>
      <div className="flex w-[4.5rem] shrink-0 justify-end">{action}</div>
    </li>
  );
}
