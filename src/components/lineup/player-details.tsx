import { Lock } from "lucide-react";

import { formatKickoff } from "@/lib/lineup/format";
import type { InjuryStatus, PoolPlayer } from "@/lib/lineup/rules";
import { cn } from "@/lib/utils";

const INJURY_STYLES: Record<InjuryStatus, { short: string; label: string; className: string }> = {
  out: { short: "OUT", label: "Out", className: "bg-red-600 text-white" },
  doubtful: { short: "D", label: "Doubtful", className: "bg-orange-500 text-white" },
  questionable: { short: "Q", label: "Questionable", className: "bg-amber-400 text-black" },
  probable: { short: "P", label: "Probable", className: "bg-emerald-600 text-white" },
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

/** Kickoff time, with a lock once the game has started. */
export function Kickoff({ player, locked }: { player: PoolPlayer; locked: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1", locked && "font-medium text-foreground")}>
      {locked && <Lock className="size-3" aria-label="Locked" />}
      {locked ? "Locked · " : ""}
      {formatKickoff(player.kickoffAt)}
    </span>
  );
}
