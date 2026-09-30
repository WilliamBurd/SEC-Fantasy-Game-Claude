/** Filtering and sorting the week's player pool. Pure, for testing. */

import { isLocked, type PoolPlayer, type Position } from "./rules";

export type PositionFilter = "ALL" | Position | "FLEX";
export type PoolSort = "salary_desc" | "salary_asc" | "ppg" | "value" | "points" | "kickoff" | "name";

export type PoolFilters = {
  search: string;
  position: PositionFilter;
  team: string; // "ALL" or a team name
  maxSalary: number | null;
  hideNoPoints: boolean;
  sort: PoolSort;
};

export const DEFAULT_FILTERS: PoolFilters = {
  search: "",
  position: "ALL",
  team: "ALL",
  maxSalary: null,
  hideNoPoints: true,
  sort: "salary_desc",
};

export const SORT_LABELS: Record<PoolSort, string> = {
  salary_desc: "Salary: high to low",
  salary_asc: "Salary: low to high",
  ppg: "Blended PPG",
  value: "Value (PPG per credit)",
  points: "Points this week",
  kickoff: "Kickoff",
  name: "Name",
};

/** Lower-case, accents removed, so "jose" finds "José". */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function matchesPosition(position: Position, filter: PositionFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "FLEX") return position !== "QB";
  return position === filter;
}

const ppg = (p: PoolPlayer) => p.blendedPpg ?? 0;

const COMPARE: Record<PoolSort, (a: PoolPlayer, b: PoolPlayer) => number> = {
  salary_desc: (a, b) => b.salary - a.salary || ppg(b) - ppg(a),
  salary_asc: (a, b) => a.salary - b.salary || ppg(b) - ppg(a),
  ppg: (a, b) => ppg(b) - ppg(a) || a.salary - b.salary,
  value: (a, b) => ppg(b) / b.salary - ppg(a) / a.salary || a.salary - b.salary,
  points: (a, b) => b.weekPoints - a.weekPoints || ppg(b) - ppg(a),
  kickoff: (a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || b.salary - a.salary,
  name: () => 0,
};

/**
 * The players to list. With `lockedLast`, players whose game has kicked off
 * (who can't be added) go to the bottom.
 */
export function filterPool(
  players: PoolPlayer[],
  filters: PoolFilters,
  now: Date,
  { lockedLast = false }: { lockedLast?: boolean } = {},
): PoolPlayer[] {
  const search = normalize(filters.search);
  const shown = players.filter(
    (p) =>
      matchesPosition(p.position, filters.position) &&
      (filters.team === "ALL" || p.team === filters.team) &&
      (filters.maxSalary === null || p.salary <= filters.maxSalary) &&
      (!filters.hideNoPoints || ppg(p) > 0 || p.weekPoints !== 0) &&
      (search === "" || normalize(p.name).includes(search) || normalize(p.team).includes(search)),
  );
  const compare = COMPARE[filters.sort];
  return shown.sort(
    (a, b) =>
      (lockedLast ? Number(isLocked(a, now)) - Number(isLocked(b, now)) : 0) ||
      compare(a, b) ||
      a.name.localeCompare(b.name),
  );
}

export function teamsInPool(players: PoolPlayer[]): string[] {
  return [...new Set(players.map((p) => p.team))].sort((a, b) => a.localeCompare(b));
}
