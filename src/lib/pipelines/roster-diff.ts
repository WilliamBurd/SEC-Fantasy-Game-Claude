import type { CfbdRosterPlayer } from "@/lib/cfbd/types";
import { isPosition, type Position } from "@/lib/pricing/settings";

/** A players table row (the columns the roster check touches). */
export type PlayerRow = {
  id: number;
  first_name: string;
  last_name: string;
  team: string;
  position: Position;
  class_year: number | null;
  active: boolean;
  source: "cfbd" | "admin";
};

export type RosterChanges = {
  /** New players to insert. */
  added: PlayerRow[];
  /** Existing players seen on a roster, with refreshed details (team, position, name, class). */
  seen: PlayerRow[];
  /** Existing players who moved to a different SEC team. */
  teamChanged: { id: number; from: string; to: string }[];
  /** Existing CFBD players on no SEC roster any more. */
  deactivated: number[];
};

// Fullbacks are scored as running backs.
const POSITION_ALIASES: Record<string, Position> = { FB: "RB" };

function toPosition(value: string | null): Position | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (isPosition(upper)) return upper;
  return POSITION_ALIASES[upper] ?? null;
}

/**
 * Compares this week's SEC rosters with the players table (PRD Section 4,
 * weekly roster check). Only QB/RB/WR/TE (and FB as RB) are kept. Players are
 * never deleted, because past lineups still point to them, and admin-added
 * players are left alone.
 */
export function diffRosters(existing: PlayerRow[], rosters: CfbdRosterPlayer[]): RosterChanges {
  const byId = new Map(existing.map((p) => [p.id, p]));
  const onRoster = new Set<number>();
  const changes: RosterChanges = { added: [], seen: [], teamChanged: [], deactivated: [] };

  for (const rosterPlayer of rosters) {
    const id = Number(rosterPlayer.id);
    const position = toPosition(rosterPlayer.position);
    if (!Number.isSafeInteger(id) || id <= 0 || !position || onRoster.has(id)) continue;
    onRoster.add(id);

    const row: PlayerRow = {
      id,
      first_name: rosterPlayer.firstName,
      last_name: rosterPlayer.lastName,
      team: rosterPlayer.team,
      position,
      class_year: rosterPlayer.year ?? null,
      active: true,
      source: "cfbd",
    };

    const current = byId.get(id);
    if (!current) {
      changes.added.push(row);
      continue;
    }
    if (current.team !== row.team) {
      changes.teamChanged.push({ id, from: current.team, to: row.team });
    }
    changes.seen.push({ ...row, source: current.source });
  }

  for (const player of existing) {
    if (player.source === "cfbd" && player.active && !onRoster.has(player.id)) {
      changes.deactivated.push(player.id);
    }
  }

  return changes;
}
