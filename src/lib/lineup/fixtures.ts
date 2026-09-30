import type { PoolPlayer, Position } from "./rules";

/** A pool player for tests; kicks off Saturday 3:30 PM ET unless told otherwise. */
export function poolPlayer(id: number, position: Position, salary: number, extra: Partial<PoolPlayer> = {}): PoolPlayer {
  return {
    id,
    name: `Player ${position}${id}`,
    team: "Georgia",
    position,
    active: true,
    salary,
    blendedPpg: salary,
    weekPoints: 0,
    opponent: "Alabama",
    home: true,
    kickoffAt: "2026-10-03T19:30:00Z",
    injury: null,
    ...extra,
  };
}
