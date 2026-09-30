/**
 * The lineup rules, as pure functions. They mirror the database's
 * validate_lineup() trigger (supabase/migrations/20260929000000_initial_schema.sql)
 * so the builder can warn before saving; the trigger stays the final word.
 */

export type Position = "QB" | "RB" | "WR" | "TE";
export type SlotKey = "qb" | "rb1" | "rb2" | "wr1" | "wr2" | "te" | "flex";
export type InjuryStatus = "out" | "doubtful" | "questionable" | "probable";

export type Slot = { key: SlotKey; label: string; column: `${SlotKey}_id`; allowed: Position[] };

/** In the trigger's order, with the same labels its messages use. */
export const SLOTS: Slot[] = [
  { key: "qb", label: "QB", column: "qb_id", allowed: ["QB"] },
  { key: "rb1", label: "RB1", column: "rb1_id", allowed: ["RB"] },
  { key: "rb2", label: "RB2", column: "rb2_id", allowed: ["RB"] },
  { key: "wr1", label: "WR1", column: "wr1_id", allowed: ["WR"] },
  { key: "wr2", label: "WR2", column: "wr2_id", allowed: ["WR"] },
  { key: "te", label: "TE", column: "te_id", allowed: ["TE"] },
  { key: "flex", label: "FLEX", column: "flex_id", allowed: ["RB", "WR", "TE"] },
];

export const SLOT_KEYS = SLOTS.map((s) => s.key);
export const SALARY_CAP = 100;

/** Player IDs by slot; null is an empty slot (scores 0). */
export type LineupSlots = Record<SlotKey, number | null>;

export const EMPTY_LINEUP: LineupSlots = { qb: null, rb1: null, rb2: null, wr1: null, wr2: null, te: null, flex: null };

/** A player in the week's pool, as the builder shows them. */
export type PoolPlayer = {
  id: number;
  name: string;
  team: string;
  position: Position;
  active: boolean;
  salary: number;
  blendedPpg: number | null;
  /** Points scored this week so far (0 until their game is played). */
  weekPoints: number;
  opponent: string;
  home: boolean;
  kickoffAt: string;
  injury: { status: InjuryStatus; injury: string | null; note: string | null } | null;
};

export type PlayersById = ReadonlyMap<number, PoolPlayer>;

export function slotByKey(key: SlotKey): Slot {
  return SLOTS.find((s) => s.key === key)!;
}

export function fitsSlot(position: Position, key: SlotKey): boolean {
  return slotByKey(key).allowed.includes(position);
}

/** Locked once their game has kicked off, like is_player_locked(). */
export function isLocked(player: Pick<PoolPlayer, "kickoffAt">, now: Date): boolean {
  return new Date(player.kickoffAt).getTime() <= now.getTime();
}

/** A slot is locked when the player saved in it has kicked off. */
export function isSlotLocked(saved: LineupSlots, key: SlotKey, players: PlayersById, now: Date): boolean {
  const id = saved[key];
  if (id === null) return false;
  const player = players.get(id);
  return player ? isLocked(player, now) : false;
}

export function totalSalary(slots: LineupSlots, players: PlayersById): number {
  return SLOT_KEYS.reduce((sum, key) => {
    const id = slots[key];
    return id === null ? sum : sum + (players.get(id)?.salary ?? 0);
  }, 0);
}

export function filledCount(slots: LineupSlots): number {
  return SLOT_KEYS.filter((key) => slots[key] !== null).length;
}

export function slotOf(slots: LineupSlots, playerId: number): SlotKey | null {
  return SLOT_KEYS.find((key) => slots[key] === playerId) ?? null;
}

export type AddResult = { ok: true; slot: SlotKey } | { ok: false; reason: string };

/**
 * Where a click on "add" puts a player. With a `target` slot picked (the user
 * tapped a slot first), the player goes there, replacing whoever is in it.
 * Otherwise the first empty slot for their position, then FLEX.
 */
export function placePlayer(
  draft: LineupSlots,
  saved: LineupSlots,
  player: PoolPlayer,
  players: PlayersById,
  now: Date,
  target: SlotKey | null = null,
): AddResult {
  if (slotOf(draft, player.id)) return { ok: false, reason: "Already in your lineup" };
  if (!player.active) return { ok: false, reason: "Inactive" };
  if (isLocked(player, now)) return { ok: false, reason: "Game has kicked off" };

  const open = (key: SlotKey) => !isSlotLocked(saved, key, players, now);
  let slot: SlotKey | null = null;
  if (target && fitsSlot(player.position, target) && open(target)) {
    slot = target;
  } else {
    slot = SLOT_KEYS.find((key) => draft[key] === null && fitsSlot(player.position, key) && open(key)) ?? null;
  }
  if (!slot) {
    const orFlex = player.position === "QB" ? "" : " or FLEX";
    return { ok: false, reason: `No open ${player.position}${orFlex} slot` };
  }

  const replaced = draft[slot];
  const salary = totalSalary(draft, players) - (replaced === null ? 0 : (players.get(replaced)?.salary ?? 0)) + player.salary;
  if (salary > SALARY_CAP) return { ok: false, reason: `Over the cap by ${salary - SALARY_CAP}` };
  return { ok: true, slot };
}

/**
 * Everything the database would reject about saving `draft` over `saved`,
 * in the trigger's words. Empty when the save should succeed.
 */
export function validateLineup(draft: LineupSlots, saved: LineupSlots, players: PlayersById, now: Date): string[] {
  const errors: string[] = [];
  const filled = SLOT_KEYS.map((key) => draft[key]).filter((id): id is number => id !== null);
  if (new Set(filled).size !== filled.length) errors.push("A player can fill only one slot in a lineup.");

  for (const slot of SLOTS) {
    const before = saved[slot.key];
    const after = draft[slot.key];
    if (before !== after && isSlotLocked(saved, slot.key, players, now)) {
      errors.push(`The ${slot.label} slot is locked because that player's game has kicked off.`);
    }
    if (after === null) continue;

    const player = players.get(after);
    if (!player) {
      errors.push(`${playerName(after, players)} isn't in this week's player pool.`);
      continue;
    }
    if (!slot.allowed.includes(player.position)) errors.push(`A ${player.position} can't fill the ${slot.label} slot.`);
    if (before !== after) {
      if (!player.active) errors.push(`${player.name} is inactive and can't be added.`);
      if (isLocked(player, now)) {
        errors.push(`${player.name}'s game has kicked off, so they can't be added to the ${slot.label} slot.`);
      }
    }
  }

  const salary = totalSalary(draft, players);
  if (salary > SALARY_CAP) errors.push(`This lineup costs ${salary} credits; the cap is ${SALARY_CAP}.`);
  return errors;
}

export function sameLineup(a: LineupSlots, b: LineupSlots): boolean {
  return SLOT_KEYS.every((key) => a[key] === b[key]);
}

function playerName(id: number, players: PlayersById): string {
  return players.get(id)?.name ?? `Player ${id}`;
}

/** The database names players by ID ("Player 12345 isn't..."); swap in names. */
export function friendlyError(message: string, players: PlayersById): string {
  return message.replace(/Player (-?\d+)/g, (match, id: string) => players.get(Number(id))?.name ?? match);
}

/** Reads a lineup row's slot columns. */
export function slotsFromRow(row: Partial<Record<Slot["column"], number | null>> | null): LineupSlots {
  const slots = { ...EMPTY_LINEUP };
  if (!row) return slots;
  for (const slot of SLOTS) slots[slot.key] = row[slot.column] ?? null;
  return slots;
}

/** The slot columns to write for a lineup. */
export function slotsToRow(slots: LineupSlots): Record<Slot["column"], number | null> {
  return Object.fromEntries(SLOTS.map((slot) => [slot.column, slots[slot.key]])) as Record<Slot["column"], number | null>;
}

/**
 * Checks a save request from the browser: a season, a week and seven slots
 * holding a player ID or null. Anything else is refused.
 */
export function parseSaveRequest(
  input: unknown,
): { ok: true; season: number; week: number; slots: LineupSlots } | { ok: false } {
  if (!input || typeof input !== "object") return { ok: false };
  const { season, week, slots } = input as Record<string, unknown>;
  if (!isWholeNumber(season) || !isWholeNumber(week) || !slots || typeof slots !== "object") return { ok: false };
  if (season < 2000 || season > 2100 || week < 0 || week > 30) return { ok: false };
  const raw = slots as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !SLOT_KEYS.includes(key as SlotKey))) return { ok: false };
  const parsed = { ...EMPTY_LINEUP };
  for (const key of SLOT_KEYS) {
    const value = raw[key] ?? null;
    if (value !== null && !isWholeNumber(value)) return { ok: false };
    parsed[key] = value;
  }
  return { ok: true, season, week, slots: parsed };
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}
