/**
 * Decides whether a parsed injury report can be trusted enough to replace
 * the stored one. If Covers changes its page layout, or serves an error or
 * partial page, the parser finds little or nothing; writing that would wipe
 * good data, so the job keeps the old report instead. Pure, for testing.
 */
import type { CoversTeam } from "./covers";
import type { MatchResult } from "./match";

/** Covers lists every FBS team (about 136), including ones with nobody hurt. */
export const MIN_TEAMS_ON_PAGE = 100;
/** Of our 16 SEC teams, how many must appear before we trust the page. */
export const MIN_SEC_TEAMS = 12;
/** Refuse a report that clears more than this share of the stored entries at once... */
export const MAX_DROP_SHARE = 0.6;
/** ...once there are at least this many (early in the season lists are short). */
export const MIN_ENTRIES_FOR_DROP_CHECK = 10;

export type SafetyCheck = { ok: true } | { ok: false; reason: string };

export function checkInjuryReport(
  report: CoversTeam[],
  match: MatchResult,
  secTeamCount: number,
  storedEntries: number,
): SafetyCheck {
  if (report.length < MIN_TEAMS_ON_PAGE) {
    return { ok: false, reason: `Found ${report.length} teams on the page; expected at least ${MIN_TEAMS_ON_PAGE}.` };
  }

  const miscounted = report.filter((t) => t.injuries.length !== t.listedCount);
  if (miscounted.length > 0) {
    const t = miscounted[0];
    return {
      ok: false,
      reason: `Read ${t.injuries.length} players for ${t.team} but the page lists ${t.listedCount} (${miscounted.length} teams differ). The layout may have changed.`,
    };
  }

  const total = report.reduce((n, t) => n + t.injuries.length, 0);
  if (total === 0) return { ok: false, reason: "The page lists no injuries at all." };

  const unreadable = report.flatMap((t) => t.injuries).filter((i) => i.status === null).length;
  if (unreadable > total / 2) {
    return { ok: false, reason: `${unreadable} of ${total} statuses weren't recognised. The status wording may have changed.` };
  }

  const secTeams = new Set(match.teamsInReport).size;
  const minSec = Math.min(MIN_SEC_TEAMS, secTeamCount);
  if (secTeams < minSec) {
    return { ok: false, reason: `Found ${secTeams} SEC teams on the page; expected at least ${minSec}.` };
  }

  const kept = match.matched.filter((m) => m.injury.status !== null).length;
  if (storedEntries >= MIN_ENTRIES_FOR_DROP_CHECK && kept < storedEntries * (1 - MAX_DROP_SHARE)) {
    return {
      ok: false,
      reason: `The report would cut the stored injuries from ${storedEntries} to ${kept}. Check the page, or have an admin clear them.`,
    };
  }
  return { ok: true };
}
