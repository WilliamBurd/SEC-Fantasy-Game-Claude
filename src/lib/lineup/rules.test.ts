import { describe, expect, it } from "vitest";

import { poolPlayer } from "./fixtures";
import {
  EMPTY_LINEUP,
  friendlyError,
  parseSaveRequest,
  placePlayer,
  slotsFromRow,
  slotsToRow,
  totalSalary,
  validateLineup,
  type LineupSlots,
  type PoolPlayer,
} from "./rules";

const before = new Date("2026-10-03T12:00:00Z"); // Saturday morning
const afternoon = new Date("2026-10-03T17:00:00Z"); // after the noon game kicks off
const NOON = "2026-10-03T16:00:00Z";

const pool: PoolPlayer[] = [
  poolPlayer(1, "QB", 30),
  poolPlayer(2, "QB", 20),
  poolPlayer(3, "RB", 20),
  poolPlayer(4, "RB", 15),
  poolPlayer(5, "RB", 10),
  poolPlayer(6, "WR", 10),
  poolPlayer(7, "WR", 10),
  poolPlayer(8, "TE", 5),
  poolPlayer(9, "WR", 5, { kickoffAt: NOON }),
  poolPlayer(10, "TE", 5, { active: false }),
  poolPlayer(11, "RB", 11),
  poolPlayer(12, "TE", 6),
];
const byId = new Map(pool.map((p) => [p.id, p]));
const p = (id: number) => byId.get(id)!;

const lineup = (slots: Partial<LineupSlots>): LineupSlots => ({ ...EMPTY_LINEUP, ...slots });
const full = lineup({ qb: 1, rb1: 3, rb2: 4, wr1: 6, wr2: 7, te: 8, flex: 5 }); // exactly 100 credits

describe("totalSalary", () => {
  it("adds up filled slots", () => {
    expect(totalSalary(full, byId)).toBe(100);
    expect(totalSalary(EMPTY_LINEUP, byId)).toBe(0);
  });
});

describe("placePlayer", () => {
  it("fills the first open slot for the position, then FLEX", () => {
    expect(placePlayer(EMPTY_LINEUP, EMPTY_LINEUP, p(3), byId, before)).toEqual({ ok: true, slot: "rb1" });
    expect(placePlayer(lineup({ rb1: 3, rb2: 4 }), EMPTY_LINEUP, p(5), byId, before)).toEqual({ ok: true, slot: "flex" });
  });

  it("never puts a QB at FLEX", () => {
    expect(placePlayer(lineup({ qb: 1 }), EMPTY_LINEUP, p(2), byId, before)).toEqual({ ok: false, reason: "No open QB slot" });
  });

  it("uses the slot the user picked, replacing its player", () => {
    const draft = lineup({ rb1: 3, rb2: 4 });
    expect(placePlayer(draft, EMPTY_LINEUP, p(5), byId, before, "rb2")).toEqual({ ok: true, slot: "rb2" });
    // A picked slot the player can't fill is ignored.
    expect(placePlayer(draft, EMPTY_LINEUP, p(6), byId, before, "rb2")).toEqual({ ok: true, slot: "wr1" });
  });

  it("checks the cap, counting a replaced player's salary", () => {
    const ninety = lineup({ qb: 1, rb1: 3, rb2: 4, wr1: 6, wr2: 7, te: 8 });
    expect(placePlayer(ninety, EMPTY_LINEUP, p(5), byId, before)).toEqual({ ok: true, slot: "flex" });
    expect(placePlayer(ninety, EMPTY_LINEUP, p(11), byId, before)).toEqual({ ok: false, reason: "Over the cap by 1" });
    // Swapping the 30-credit QB for a 20-credit one frees room.
    expect(placePlayer(full, EMPTY_LINEUP, p(2), byId, before, "qb")).toEqual({ ok: true, slot: "qb" });
  });

  it("refuses players already in, inactive, or whose game has kicked off", () => {
    expect(placePlayer(full, full, p(3), byId, before)).toEqual({ ok: false, reason: "Already in your lineup" });
    expect(placePlayer(EMPTY_LINEUP, EMPTY_LINEUP, p(10), byId, before)).toEqual({ ok: false, reason: "Inactive" });
    expect(placePlayer(EMPTY_LINEUP, EMPTY_LINEUP, p(9), byId, afternoon)).toEqual({ ok: false, reason: "Game has kicked off" });
  });

  it("won't replace a locked player", () => {
    const saved = lineup({ wr1: 9 });
    expect(placePlayer(saved, saved, p(6), byId, afternoon, "wr1")).toEqual({ ok: true, slot: "wr2" });
  });
});

describe("validateLineup", () => {
  it("accepts a full lineup at the cap, a partial one and an empty one", () => {
    expect(validateLineup(full, EMPTY_LINEUP, byId, before)).toEqual([]);
    expect(validateLineup(lineup({ qb: 2, flex: 9 }), EMPTY_LINEUP, byId, before)).toEqual([]);
    expect(validateLineup(EMPTY_LINEUP, full, byId, before)).toEqual([]);
  });

  it("matches the trigger's rules", () => {
    expect(validateLineup(lineup({ rb1: 3, flex: 3 }), EMPTY_LINEUP, byId, before)).toContain(
      "A player can fill only one slot in a lineup.",
    );
    expect(validateLineup(lineup({ flex: 1 }), EMPTY_LINEUP, byId, before)).toEqual(["A QB can't fill the FLEX slot."]);
    expect(validateLineup(lineup({ rb1: 6 }), EMPTY_LINEUP, byId, before)).toEqual(["A WR can't fill the RB1 slot."]);
    expect(validateLineup(lineup({ te: 10 }), EMPTY_LINEUP, byId, before)).toEqual([
      "Player TE10 is inactive and can't be added.",
    ]);
    expect(validateLineup(lineup({ qb: 99 }), EMPTY_LINEUP, byId, before)).toEqual([
      "Player 99 isn't in this week's player pool.",
    ]);
    expect(validateLineup({ ...full, te: 12 }, EMPTY_LINEUP, byId, before)).toEqual([
      "This lineup costs 101 credits; the cap is 100.",
    ]);
  });

  it("keeps an inactive player who was already saved", () => {
    const saved = lineup({ te: 10 });
    expect(validateLineup(lineup({ te: 10, qb: 1 }), saved, byId, before)).toEqual([]);
  });

  it("stops changes to locked slots and adding players who have kicked off", () => {
    const saved = lineup({ wr1: 9 });
    expect(validateLineup(lineup({ wr1: null }), saved, byId, afternoon)).toEqual([
      "The WR1 slot is locked because that player's game has kicked off.",
    ]);
    expect(validateLineup(lineup({ wr2: 9 }), saved, byId, afternoon)).toEqual([
      "The WR1 slot is locked because that player's game has kicked off.",
      "Player WR9's game has kicked off, so they can't be added to the WR2 slot.",
    ]);
    // Unlocked slots stay editable next to a locked one.
    expect(validateLineup(lineup({ wr1: 9, wr2: 6, qb: 1 }), saved, byId, afternoon)).toEqual([]);
  });
});

describe("friendlyError", () => {
  it("swaps player IDs in database messages for names", () => {
    expect(friendlyError("Player 3 isn't in the player pool for week 5 of 2026.", byId)).toBe(
      "Player RB3 isn't in the player pool for week 5 of 2026.",
    );
    expect(friendlyError("Player 99 is inactive and can't be added.", byId)).toBe("Player 99 is inactive and can't be added.");
  });
});

describe("row conversion", () => {
  it("round-trips slot columns", () => {
    const row = slotsToRow(full);
    expect(row).toEqual({ qb_id: 1, rb1_id: 3, rb2_id: 4, wr1_id: 6, wr2_id: 7, te_id: 8, flex_id: 5 });
    expect(slotsFromRow(row)).toEqual(full);
    expect(slotsFromRow(null)).toEqual(EMPTY_LINEUP);
  });
});

describe("parseSaveRequest", () => {
  it("accepts a season, week and slots", () => {
    expect(parseSaveRequest({ season: 2026, week: 5, slots: { qb: 1, flex: null } })).toEqual({
      ok: true,
      season: 2026,
      week: 5,
      slots: lineup({ qb: 1 }),
    });
  });

  it("refuses anything else", () => {
    expect(parseSaveRequest(null).ok).toBe(false);
    expect(parseSaveRequest({ season: "2026", week: 5, slots: {} }).ok).toBe(false);
    expect(parseSaveRequest({ season: 2026, week: 5.5, slots: {} }).ok).toBe(false);
    expect(parseSaveRequest({ season: 2026, week: 5, slots: { qb: "1" } }).ok).toBe(false);
    expect(parseSaveRequest({ season: 2026, week: 5, slots: { total_salary: 0 } }).ok).toBe(false);
  });
});
