"use client";

import { Check, Lock, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";

import { saveLineup } from "@/app/(app)/lineup/actions";
import { HeaderFigure, PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { formatPpg, lockCountdown } from "@/lib/lineup/format";
import { DEFAULT_FILTERS, type PoolFilters, type PositionFilter } from "@/lib/lineup/pool";
import {
  SALARY_CAP,
  SLOTS,
  filledCount,
  friendlyError,
  isLocked,
  isSlotLocked,
  placePlayer,
  sameLineup,
  totalSalary,
  validateLineup,
  type LineupSlots,
  type PoolPlayer,
  type SlotKey,
} from "@/lib/lineup/rules";
import { cn } from "@/lib/utils";

import { InjuryBadge, Kickoff, injuryText, matchup } from "./player-details";
import { PlayerList } from "./player-list";

type Props = {
  season: number;
  week: number;
  /** Every game this week has kicked off: show the lineup, allow no changes. */
  readOnly: boolean;
  nextWeekMessage: string | null;
  players: PoolPlayer[];
  saved: LineupSlots;
  hasLineup: boolean;
  totalScore: number;
  serverNow: string;
};

type State = { draft: LineupSlots; target: SlotKey | null; filters: PoolFilters };

type Action =
  | { type: "put"; slot: SlotKey; playerId: number }
  | { type: "remove"; slot: SlotKey }
  | { type: "target"; slot: SlotKey | null }
  | { type: "reset"; draft: LineupSlots }
  | { type: "filters"; filters: Partial<PoolFilters> };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "put":
      return { ...state, draft: { ...state.draft, [action.slot]: action.playerId }, target: null };
    case "remove":
      return { ...state, draft: { ...state.draft, [action.slot]: null }, target: null };
    case "target": {
      if (action.slot === null) return { ...state, target: null };
      const allowed = SLOTS.find((s) => s.key === action.slot)!.allowed;
      const position: PositionFilter = allowed.length > 1 ? "FLEX" : allowed[0];
      return { ...state, target: action.slot, filters: { ...state.filters, position } };
    }
    case "reset":
      return { ...state, draft: action.draft, target: null };
    case "filters":
      return { ...state, filters: { ...state.filters, ...action.filters } };
  }
}

const TICK_MS = 30_000;

/** The lineup builder: seven slots, the budget, and the week's player pool. */
export function LineupBuilder(props: Props) {
  const { season, week, readOnly, players } = props;
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  // Locks follow the clock, so re-check every 30 seconds while the page is open.
  const [now, setNow] = useState(() => new Date(props.serverNow));
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const [saved, setSaved] = useState(props.saved);
  const [hasLineup, setHasLineup] = useState(props.hasLineup);
  const [state, dispatch] = useReducer(reducer, {
    draft: props.saved,
    target: null,
    filters: readOnly ? { ...DEFAULT_FILTERS, sort: "points" } : DEFAULT_FILTERS,
  });
  const { draft, target, filters } = state;
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  const salary = totalSalary(draft, byId);
  const remaining = SALARY_CAP - salary;
  const dirty = !sameLineup(draft, saved);
  const problems = dirty ? validateLineup(draft, saved, byId, now) : [];

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const lineupRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const isPhone = () => window.matchMedia("(max-width: 1023px)").matches;

  function pickSlot(slot: SlotKey) {
    const choosing = target !== slot;
    dispatch({ type: "target", slot: choosing ? slot : null });
    if (choosing && isPhone()) listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function add(player: PoolPlayer) {
    const result = placePlayer(draft, saved, player, byId, now, target);
    if (!result.ok) return;
    const cameFromSlot = target !== null;
    dispatch({ type: "put", slot: result.slot, playerId: player.id });
    setMessage(null);
    if (cameFromSlot && isPhone()) lineupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function remove(slot: SlotKey) {
    dispatch({ type: "remove", slot });
    setMessage(null);
  }

  function save() {
    const snapshot = draft;
    setMessage(null);
    startSaving(async () => {
      const result = await saveLineup({ season, week, slots: snapshot });
      if (result.ok) {
        setSaved(snapshot);
        setHasLineup(true);
        setMessage({ error: false, text: "Lineup saved." });
      } else {
        setMessage({ error: true, text: friendlyError(result.error, byId) });
      }
    });
  }

  const allLocked = players.length > 0 && players.every((p) => isLocked(p, now));
  const showPoints = readOnly || players.some((p) => isLocked(p, now));
  const lockedSlots = SLOTS.filter((slot) => isSlotLocked(saved, slot.key, byId, now)).length;
  // The next of your players to lock, for the header.
  const nextKickoff = SLOTS.map((slot) => draft[slot.key])
    .map((id) => (id === null ? undefined : byId.get(id)))
    .filter((p): p is PoolPlayer => p !== undefined && !isLocked(p, now))
    .map((p) => p.kickoffAt)
    .sort()[0];
  const nextLock = nextKickoff ? lockCountdown(nextKickoff, now) : null;

  return (
    <>
      <PageHeader
        eyebrow={[
          `Week ${week}`,
          lockedSlots > 0 && !readOnly && !allLocked ? `${lockedSlots} locked` : null,
          nextLock ? `next ${nextLock.charAt(0).toLowerCase()}${nextLock.slice(1)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        title="Your lineup"
        aside={
          (readOnly || allLocked) && hasLineup ? (
            <HeaderFigure value={props.totalScore.toFixed(2)} label="points" />
          ) : remaining < 0 ? (
            <HeaderFigure value={-remaining} label="credits over" tone="danger" />
          ) : (
            <HeaderFigure value={remaining} label="credits left" />
          )
        }
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-44 sm:pb-32">
        {readOnly || allLocked ? (
          <div className="rounded-xl bg-card p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <Lock className="size-4 text-primary" /> Every Week {week} game has kicked off, so this lineup is locked.
            </p>
            {!hasLineup && <p className="mt-1 text-muted-foreground">You didn&apos;t set a lineup for Week {week}.</p>}
            {props.nextWeekMessage && <p className="mt-1 text-muted-foreground">{props.nextWeekMessage}</p>}
          </div>
        ) : (
          <p className="max-w-prose text-sm text-muted-foreground">
            Pick a QB, two RBs, two WRs, a TE and a FLEX (RB, WR or TE) for {SALARY_CAP} credits or less. Each player
            locks when their own game kicks off; you can change the rest until then. Empty slots score 0.
          </p>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
          <section ref={lineupRef} aria-labelledby="lineup-heading" className="scroll-mt-20 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto lg:pb-2">
            <h2 id="lineup-heading" className="sr-only">
              Your players
            </h2>
            <ul className="flex flex-col gap-[7px]">
              {SLOTS.map((slot) => {
                const id = draft[slot.key];
                const player = id === null ? null : (byId.get(id) ?? null);
                return (
                  <SlotRow
                    key={slot.key}
                    now={now}
                    label={slot.label}
                    hint={slot.allowed.join("/")}
                    playerId={id}
                    player={player}
                    slotLocked={isSlotLocked(saved, slot.key, byId, now) || (player !== null && isLocked(player, now))}
                    canEdit={!readOnly && !isSlotLocked(saved, slot.key, byId, now)}
                    canFill={!readOnly && !allLocked}
                    active={target === slot.key}
                    showPoints={showPoints}
                    onPick={() => pickSlot(slot.key)}
                    onRemove={() => remove(slot.key)}
                  />
                );
              })}
            </ul>

            {problems.length > 0 && (
              <ul role="alert" className="mt-3 list-disc rounded-md border border-destructive/40 bg-destructive/10 py-2 pr-3 pl-7 text-sm text-destructive">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}

            {/* Budget and save: always on screen, in a bar along the bottom. */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-header px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(0_0_0/0.35)]">
              <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
                <div className="flex flex-col gap-1 sm:flex-1">
                  <Budget salary={salary} remaining={remaining} filled={filledCount(draft)} />
                  {message && (
                    <p role={message.error ? "alert" : "status"} className={cn("text-sm", message.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>
                      {message.text}
                    </p>
                  )}
                </div>
                {!readOnly && (
                  <div className="flex gap-2 sm:w-80">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 shrink-0 rounded-xl"
                      aria-label="Undo changes since your last save"
                      disabled={!dirty || saving}
                      onClick={() => {
                        dispatch({ type: "reset", draft: saved });
                        setMessage(null);
                      }}
                    >
                      <RotateCcw /> Undo
                    </Button>
                    <Button
                      type="button"
                      className={cn(
                      "h-12 flex-1 rounded-xl font-display text-xl font-extrabold tracking-wide",
                      // Nothing to save: a calm navy "Saved" rather than a faded gold button.
                      !dirty && hasLineup && "bg-secondary text-foreground disabled:opacity-100",
                    )}
                      disabled={!dirty || problems.length > 0 || saving}
                      onClick={save}
                    >
                      {saving ? "Saving..." : dirty ? "Save lineup" : hasLineup ? (
                        <>
                          <Check className="text-primary" /> Saved
                        </>
                      ) : (
                        "Save lineup"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section ref={listRef} aria-labelledby="players-heading" className="scroll-mt-16">
            <PlayerList
              players={players}
              filters={filters}
              onFilters={(f) => dispatch({ type: "filters", filters: f })}
              target={target === null ? null : SLOTS.find((s) => s.key === target)!.label}
              onCancelTarget={() => dispatch({ type: "target", slot: null })}
              draft={draft}
              check={(p) => placePlayer(draft, saved, p, byId, now, target)}
              onAdd={add}
              onRemove={remove}
              canEditSlot={(slot) => !readOnly && !isSlotLocked(saved, slot, byId, now)}
              now={now}
              readOnly={readOnly}
              showPoints={showPoints}
            />
          </section>
        </div>
      </main>
    </>
  );
}

function Budget({ salary, remaining, filled }: { salary: number; remaining: number; filled: number }) {
  const over = remaining < 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>
          <span className={cn("font-display text-2xl font-extrabold", over ? "text-destructive" : "text-primary")}>
            {over ? -remaining : remaining}
          </span>{" "}
          <span className="text-muted-foreground">{over ? "credits over the cap" : "credits left"}</span>
        </span>
        <span className="text-muted-foreground tabular-nums">
          {salary}/{SALARY_CAP} used · {filled}/7 filled
        </span>
      </div>
      <div
        className="mt-1 h-2 overflow-hidden rounded-full bg-border"
        role="meter"
        aria-label="Credits used"
        aria-valuemin={0}
        aria-valuemax={SALARY_CAP}
        aria-valuenow={salary}
      >
        <div
          className={cn("h-full rounded-full transition-all", over ? "bg-destructive" : "bg-primary")}
          style={{ width: `${Math.min(100, (salary / SALARY_CAP) * 100)}%` }}
        />
      </div>
    </div>
  );
}

type SlotRowProps = {
  now: Date;
  label: string;
  hint: string;
  playerId: number | null;
  player: PoolPlayer | null;
  slotLocked: boolean;
  canEdit: boolean;
  canFill: boolean;
  active: boolean;
  showPoints: boolean;
  onPick: () => void;
  onRemove: () => void;
};

function SlotRow({ now, label, hint, playerId, player, slotLocked, canEdit, canFill, active, showPoints, onPick, onRemove }: SlotRowProps) {
  const chip = "flex size-[46px] shrink-0 items-center justify-center rounded-[9px] font-display font-extrabold";
  const chipText = label.length > 3 ? "text-base" : "text-lg";

  if (playerId === null) {
    return (
      <li>
        <button
          type="button"
          onClick={onPick}
          disabled={!canFill}
          aria-pressed={active}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border-[1.5px] border-dashed border-input p-2 pr-4 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60",
            active && "border-solid border-primary bg-accent text-foreground",
          )}
        >
          <span className={cn(chip, chipText, "border-[1.5px] border-primary text-primary")}>{label}</span>
          <span className="flex-1">{active ? `Choose a ${hint} from the list` : canFill ? `Add ${hint}` : "Empty"}</span>
          {canFill && <Plus className="size-[18px] text-primary" strokeWidth={2.5} />}
        </button>
      </li>
    );
  }

  const injury = player ? injuryText(player.injury) : null;
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl p-2 pr-1.5 text-sm",
        slotLocked ? "border border-border bg-locked" : "bg-card",
        active && "ring-2 ring-primary",
      )}
    >
      <span className={cn(chip, chipText, slotLocked ? "bg-locked-chip text-muted-foreground" : "bg-primary text-primary-foreground")}>
        {label}
      </span>
      <button
        type="button"
        onClick={onPick}
        disabled={!canEdit}
        aria-pressed={active}
        aria-label={player ? `Replace ${player.name}` : undefined}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        {player ? (
          <>
            <span className="flex items-center gap-1.5">
              <span className={cn("truncate text-[15px] font-bold", slotLocked && "text-foreground/85")}>{player.name}</span>
              <InjuryBadge injury={player.injury} />
            </span>
            <span className="block truncate text-xs text-muted-foreground">{matchup(player)}</span>
            <span className="block text-xs text-muted-foreground">
              <Kickoff player={player} locked={slotLocked} now={now} />
            </span>
            {injury && <span className="block text-xs text-muted-foreground">{injury}</span>}
          </>
        ) : (
          <span className="text-destructive">Player {playerId} isn&apos;t in this week&apos;s pool</span>
        )}
      </button>
      <div className="flex shrink-0 flex-col items-end text-right">
        {player &&
          (showPoints && slotLocked ? (
            <>
              <span className="font-display text-2xl leading-none font-bold text-primary">{player.weekPoints.toFixed(1)}</span>
              <span className="text-[11px] text-muted-foreground">pts · {player.salary} cr</span>
            </>
          ) : (
            <>
              <span className="font-display text-2xl leading-none font-bold">{player.salary}</span>
              <span className="text-[11px] text-muted-foreground">{formatPpg(player.blendedPpg)} PPG</span>
            </>
          ))}
      </div>
      {canEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          onClick={onRemove}
          aria-label={`Remove ${player?.name ?? "player"} from ${label}`}
        >
          <X />
        </Button>
      ) : (
        <span className="size-9 shrink-0" />
      )}
    </li>
  );
}
