/**
 * Matches injury report names ("K. Lacy", Ole Miss, RB) to our players. Pure,
 * for testing.
 */
import type { Position } from "@/lib/pricing/settings";

import type { CoversInjury, CoversTeam } from "./covers";

export type MatchablePlayer = {
  id: number;
  first_name: string;
  last_name: string;
  team: string;
  position: Position;
};

/** Covers team names that differ from CFBD's (our players.team). */
export const COVERS_TEAM_NAMES: Record<string, string> = {
  Mississippi: "Ole Miss",
};

/** Report positions we price. Fullbacks count as RB, as in the roster pipeline. */
const REPORT_POSITIONS: Record<string, Position> = { QB: "QB", RB: "RB", FB: "RB", WR: "WR", TE: "TE" };

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Lowercase letters only, without accents or suffixes: "Sategna III" -> "sategna", "O'Neal" -> "oneal". */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .split(/[\s-]+/)
    .filter((part) => part && !SUFFIXES.has(part))
    .join("")
    .replace(/[^a-z]/g, "");
}

/** First letter of a first name, without accents ("V." is an initial here, not a suffix). */
function initialOf(firstName: string): string {
  return (
    firstName
      .normalize("NFD")
      .toLowerCase()
      .match(/[a-z]/)?.[0] ?? ""
  );
}

/** "K. Lacy" -> { initial: "k", last: "lacy" }; "Kewan Lacy Jr." works too. */
export function splitReportName(name: string): { initial: string; last: string } | null {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = normalizeName(rest.join(" "));
  const initial = initialOf(first ?? "");
  return initial && last ? { initial, last } : null;
}

export type MatchedInjury = { playerId: number; team: string; injury: CoversInjury; by: "name" | "last_name" };
export type UnmatchedInjury = {
  team: string;
  injury: CoversInjury;
  reason: "no_player" | "ambiguous";
  candidates?: number[];
};

export type MatchResult = {
  matched: MatchedInjury[];
  unmatched: UnmatchedInjury[];
  /** Our SEC teams that appear in the report, for deciding whose old entries to clear. */
  teamsInReport: string[];
};

/**
 * For every report entry on one of `teams` at a position we price:
 * 1. Same team, last name and first initial. If several, the one at the
 *    report's position.
 * 2. Otherwise the only player on the team at that position with that last
 *    name (nicknames: "Hollywood" vs "D.").
 * Anything else is unmatched. A player matched twice keeps the first entry.
 */
export function matchInjuries(report: CoversTeam[], players: MatchablePlayer[], teams: string[]): MatchResult {
  const ourTeams = new Set(teams);
  const byTeamAndLast = new Map<string, MatchablePlayer[]>();
  for (const p of players) {
    const key = `${p.team}|${normalizeName(p.last_name)}`;
    byTeamAndLast.set(key, [...(byTeamAndLast.get(key) ?? []), p]);
  }

  const matched: MatchedInjury[] = [];
  const unmatched: UnmatchedInjury[] = [];
  const teamsInReport: string[] = [];
  const seen = new Set<number>();

  for (const entry of report) {
    const team = COVERS_TEAM_NAMES[entry.team] ?? entry.team;
    if (!ourTeams.has(team)) continue;
    teamsInReport.push(team);

    for (const injury of entry.injuries) {
      const position = REPORT_POSITIONS[injury.position];
      if (!position) continue;
      const name = splitReportName(injury.name);
      const sameLast = name ? (byTeamAndLast.get(`${team}|${name.last}`) ?? []) : [];

      let candidates = sameLast.filter((p) => initialOf(p.first_name) === name?.initial);
      if (candidates.length > 1) candidates = candidates.filter((p) => p.position === position);
      let by: MatchedInjury["by"] = "name";
      if (candidates.length === 0) {
        candidates = sameLast.filter((p) => p.position === position);
        by = "last_name";
      }

      if (candidates.length === 1) {
        if (!seen.has(candidates[0].id)) {
          seen.add(candidates[0].id);
          matched.push({ playerId: candidates[0].id, team, injury, by });
        }
      } else {
        unmatched.push(
          candidates.length === 0
            ? { team, injury, reason: "no_player" }
            : { team, injury, reason: "ambiguous", candidates: candidates.map((p) => p.id) },
        );
      }
    }
  }
  return { matched, unmatched, teamsInReport };
}
