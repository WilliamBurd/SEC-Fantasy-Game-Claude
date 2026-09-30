import { describe, expect, it } from "vitest";

import { exactIlike, rosterSlots, type RosterPlayer } from "./view";

const player = (id: number, kickoffAt: string): RosterPlayer => ({
  id,
  name: `Player ${id}`,
  position: "RB",
  team: "Georgia",
  opponent: "Alabama",
  home: true,
  kickoffAt,
  points: 12.5,
});

const now = new Date("2026-10-03T18:00:00Z");
const players = new Map([
  [1, player(1, "2026-10-03T16:00:00Z")], // kicked off
  [2, player(2, "2026-10-03T23:00:00Z")], // still to come
]);

describe("rosterSlots", () => {
  it("shows another user's kicked-off picks and hides the rest while the week is on", () => {
    const slots = rosterSlots({ qb_id: 1, rb1_id: null }, players, { isOwner: false, weekOver: false, now });
    expect(slots.map((s) => s.kind)).toEqual(["player", "hidden", "hidden", "hidden", "hidden", "hidden", "hidden"]);
    expect(slots[0]).toMatchObject({ label: "QB", locked: true });
  });

  it("shows blank slots as empty once the week is over", () => {
    const slots = rosterSlots({ qb_id: 1 }, players, { isOwner: false, weekOver: true, now });
    expect(slots.slice(1).every((s) => s.kind === "empty")).toBe(true);
  });

  it("shows the owner everything, locked or not", () => {
    const slots = rosterSlots({ qb_id: 1, rb1_id: 2, rb2_id: 99 }, players, { isOwner: true, weekOver: false, now });
    expect(slots.slice(0, 4).map((s) => s.kind)).toEqual(["player", "player", "unknown", "empty"]);
    expect(slots[1]).toMatchObject({ locked: false });
    expect(rosterSlots(null, players, { isOwner: true, weekOver: false, now }).every((s) => s.kind === "empty")).toBe(true);
  });
});

describe("exactIlike", () => {
  it("escapes LIKE wildcards", () => {
    expect(exactIlike("rolltide_rae")).toBe("rolltide\\_rae");
    expect(exactIlike("a%b\\c")).toBe("a\\%b\\\\c");
  });
});
