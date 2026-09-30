import { Lock } from "lucide-react";

import { formatKickoff, lockCountdown } from "@/lib/lineup/format";
import type { InjuryStatus, PoolPlayer } from "@/lib/lineup/rules";
import { cn } from "@/lib/utils";

// Oranges and reds with dark text, so they never read as the gold accent.
const INJURY_STYLES: Record<InjuryStatus, { short: string; label: string; className: string }> = {
  out: { short: "OUT", label: "Out", className: "bg-red-600 text-white" },
  doubtful: { short: "D", label: "Doubtful", className: "bg-red-400 text-red-950" },
  questionable: { short: "Q", label: "Questionable", className: "bg-orange-400 text-orange-950" },
  probable: { short: "P", label: "Probable", className: "bg-emerald-400 text-emerald-950" },
};

/** A small coloured tag: OUT, D (doubtful), Q (questionable) or P (probable). */
export function InjuryBadge({ injury }: { injury: PoolPlayer["injury"] }) {
  if (!injury) return null;
  const style = INJURY_STYLES[injury.status];
  const detail = [style.label, injury.injury, injury.note].filter(Boolean).join(" · ");
  return (
    <span
      title={detail}
      className={cn("inline-flex shrink-0 items-center rounded px-1 text-[10px] leading-4 font-bold", style.className)}
    >
      {style.short}
      <span className="sr-only"> ({style.label})</span>
    </span>
  );
}

/** "Questionable (Knee)", for a line under the player's name. */
export function injuryText(injury: PoolPlayer["injury"]): string | null {
  if (!injury) return null;
  const label = INJURY_STYLES[injury.status].label;
  return injury.injury ? `${label} (${injury.injury})` : label;
}

/** "RB · Georgia vs Alabama" (or "@" for away games). */
export function matchup(player: PoolPlayer): string {
  return `${player.position} · ${player.team} ${player.home ? "vs" : "@"} ${player.opponent}`;
}

/** Kickoff time, a countdown in the last 24 hours, and a lock once the game has started. */
export function Kickoff({ player, locked, now }: { player: PoolPlayer; locked: boolean; now?: Date }) {
  const countdown = !locked && now ? lockCountdown(player.kickoffAt, now) : null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1", locked && "font-medium text-foreground/85")}>
      {locked && <Lock className="size-3 text-primary" strokeWidth={2.5} aria-label="Locked" />}
      {locked ? "Locked · " : ""}
      {formatKickoff(player.kickoffAt)}
      {countdown && <span className="font-semibold text-primary">· {countdown}</span>}
    </span>
  );
}
