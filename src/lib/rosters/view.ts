/** What a roster page shows in each slot. Pure, for testing. */

import { SLOTS, slotsFromRow, type LineupSlots, type SlotKey } from "@/lib/lineup/rules";

export type RosterPlayer = {
  id: number;
  name: string;
  position: string;
  team: string;
  opponent: string;
  home: boolean;
  kickoffAt: string;
  points: number;
};

export type RosterSlot =
  | { key: SlotKey; label: string; kind: "player"; player: RosterPlayer; locked: boolean }
  | { key: SlotKey; label: string; kind: "unknown"; id: number }
  /** Someone else's pick whose game hasn't kicked off (or an empty slot: the two look the same until the week is over). */
  | { key: SlotKey; label: string; kind: "hidden" }
  | { key: SlotKey; label: string; kind: "empty" };

/**
 * Other users' picks come from public_lineups, which blanks every slot whose
 * player hasn't kicked off, so a blank slot is "hidden" while the week still
 * has games to play and "empty" once every game has kicked off. The owner
 * sees their whole lineup.
 */
export function rosterSlots(
  row: Partial<Record<`${SlotKey}_id`, number | null>> | null,
  players: ReadonlyMap<number, RosterPlayer>,
  options: { isOwner: boolean; weekOver: boolean; now: Date },
): RosterSlot[] {
  const slots: LineupSlots = slotsFromRow(row);
  return SLOTS.map(({ key, label }) => {
    const id = slots[key];
    if (id === null) return options.isOwner || options.weekOver ? { key, label, kind: "empty" } : { key, label, kind: "hidden" };
    const player = players.get(id);
    if (!player) return { key, label, kind: "unknown", id };
    return { key, label, kind: "player", player, locked: new Date(player.kickoffAt).getTime() <= options.now.getTime() };
  });
}

/** "rolltide_rae" -> a pattern for a case-insensitive exact match (ILIKE treats _ and % as wildcards). */
export function exactIlike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
