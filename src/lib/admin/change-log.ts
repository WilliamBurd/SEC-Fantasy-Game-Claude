/** Plain-English change log entries for the admin screen. Pure, for testing. */

export type ChangeEntry = {
  action: string;
  details: Record<string, unknown> | null;
  /** "First Last" when the entry names a player we have. */
  playerName: string | null;
};

/** The roster check's entries, for the "Roster changes" filter. */
export const ROSTER_ACTIONS = [
  "player_added",
  "player_deactivated",
  "player_team_changed",
  "admin_player_possible_match",
  "unknown_player",
];

export const LOG_FILTERS = {
  all: { label: "Everything", actions: null },
  roster: { label: "Roster changes", actions: ROSTER_ACTIONS },
  admin: { label: "Admin changes", actions: "admin" },
  jobs: { label: "Prices and injuries", actions: ["pricing_run", "injury_report", "injury_report_skipped", "injury_unmatched"] },
} as const;
export type LogFilter = keyof typeof LOG_FILTERS;

export function pickLogFilter(value: unknown): LogFilter {
  return typeof value === "string" && value in LOG_FILTERS ? (value as LogFilter) : "all";
}

const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

export function describeChange({ action, details, playerName }: ChangeEntry): { title: string; detail: string | null } {
  const d = details ?? {};
  const who = playerName ?? str(d.name) ?? "A player";
  const where = [str(d.position), str(d.team)].filter(Boolean).join(", ");
  switch (action) {
    case "pricing_run":
      return { title: `Prices set for week ${str(d.week) ?? "?"}`, detail: d.teamsInPool ? `${d.teamsInPool} teams in the pool` : null };
    case "injury_report":
      return {
        title: "Injury report read",
        detail: `${d.updated ?? 0} updated, ${d.cleared ?? 0} cleared, ${d.unmatched ?? 0} not matched`,
      };
    case "injury_report_skipped":
      return { title: "Injury report skipped (old data kept)", detail: str(d.reason) };
    case "injury_unmatched":
      return { title: `Injury listing not matched: ${str(d.name) ?? "?"}`, detail: [str(d.team), str(d.status)].filter(Boolean).join(" · ") || null };
    case "player_added":
      return { title: `Roster check added ${who}`, detail: where || null };
    case "player_deactivated":
      return { title: `Roster check deactivated ${who}`, detail: "No longer on an SEC roster" };
    case "player_team_changed":
      return { title: `${who} changed teams`, detail: `${str(d.from) ?? "?"} → ${str(d.to) ?? "?"}` };
    case "unknown_player":
      return {
        title: `Box score player not in the pool: ${str(d.name) ?? `CFBD ${str(d.cfbd_player_id)}`}`,
        detail: [str(d.team), d.week ? `week ${d.week}` : null, d.cfbd_player_id ? `CFBD ID ${d.cfbd_player_id}` : null]
          .filter(Boolean)
          .join(" · "),
      };
    case "admin_player_possible_match":
      return { title: `${who} may now be in CFBD`, detail: `CFBD player ${str(d.cfbd_id)} (${str(d.name)}, ${str(d.team)}) looks like the same player` };
    case "admin_player_added":
      return { title: `Added ${who}`, detail: where || null };
    case "admin_player_edited":
      return { title: `Edited ${who}`, detail: summarizeEdit(d.before, d.after) };
    case "admin_player_deactivated":
      return { title: `Deactivated ${who}`, detail: null };
    case "admin_player_reactivated":
      return { title: `Reactivated ${who}`, detail: null };
    case "admin_player_merged":
      return { title: `Merged temporary player into ${who}`, detail: `${d.weeks_moved ?? 0} upcoming week(s) moved from ID ${str(d.temporary_id)}` };
    case "admin_projection":
      return {
        title: `Projection for ${who}`,
        detail: `${str(d.previous_projected_ppg) ?? "none"} → ${str(d.projected_ppg)} PPG (${str(d.season)})`,
      };
    case "admin_salary_override":
      return {
        title: `Salary override for ${who}`,
        detail: `Week ${str(d.week)}: ${str(d.previous_salary) ?? "not priced"} → ${str(d.salary)} credits`,
      };
    case "admin_salary_override_cleared":
      return { title: `Salary override cleared for ${who}`, detail: `Week ${str(d.week)}; the next pricing run sets it` };
    case "salary_override":
      return { title: `Salary override for ${who}`, detail: null };
    default:
      return { title: action.replace(/_/g, " "), detail: details ? JSON.stringify(details) : null };
  }
}

const FIELD_LABELS: Record<string, string> = {
  first_name: "first name",
  last_name: "last name",
  team: "team",
  position: "position",
  class_year: "class",
  recruiting_stars: "stars",
};

/** "team: Georgia → Alabama; position: WR → RB". */
export function summarizeEdit(before: unknown, after: unknown): string | null {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return null;
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const changes = Object.keys(FIELD_LABELS)
    .filter((key) => str(b[key]) !== str(a[key]))
    .map((key) => `${FIELD_LABELS[key]}: ${str(b[key]) ?? "–"} → ${str(a[key]) ?? "–"}`);
  return changes.length > 0 ? changes.join("; ") : null;
}
