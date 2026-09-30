/** Checks for the admin screen's forms. Pure, for testing; the database checks again. */

export const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type Position = (typeof POSITIONS)[number];

export type PlayerInput = {
  /** A known CFBD ID (new players only); null gets a temporary negative ID. */
  cfbdId: number | null;
  firstName: string;
  lastName: string;
  team: string;
  position: Position;
  classYear: number | null;
  active: boolean;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
type Field = (name: string) => FormDataEntryValue | null;

const MAX_INT = 2_147_483_647;
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "");

function wholeNumber(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

export function parsePlayerForm(field: Field, teams: readonly string[], isNew: boolean): Result<PlayerInput> {
  const firstName = text(field("firstName"));
  const lastName = text(field("lastName"));
  if (!firstName || !lastName) return { ok: false, error: "Enter a first and last name." };
  if (firstName.length > 40 || lastName.length > 40) return { ok: false, error: "Names can be up to 40 characters." };

  const team = text(field("team"));
  if (!teams.includes(team)) return { ok: false, error: "Pick an SEC team." };

  const position = text(field("position"));
  if (!(POSITIONS as readonly string[]).includes(position)) return { ok: false, error: "Pick QB, RB, WR or TE." };

  const classText = text(field("classYear"));
  const classYear = classText === "" ? null : wholeNumber(classText, 1, 6);
  if (classText !== "" && classYear === null) return { ok: false, error: "Class year is 1 (freshman) to 6." };

  let cfbdId: number | null = null;
  if (isNew) {
    const idText = text(field("cfbdId"));
    cfbdId = idText === "" ? null : wholeNumber(idText, 1, MAX_INT);
    if (idText !== "" && cfbdId === null) return { ok: false, error: "A CFBD ID is a whole number above 0." };
  }

  return {
    ok: true,
    value: { cfbdId, firstName, lastName, team, position: position as Position, classYear, active: field("active") === "on" },
  };
}

/** Points per game: 0 to 60, up to 2 decimal places. Blank means "none" when `optional`. */
function parsePpg(value: string, optional: boolean): number | null | undefined {
  if (value === "") return optional ? null : undefined;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(value)) return undefined;
  const n = Number(value);
  return n <= 60 ? n : undefined;
}

export function parseProjectionForm(field: Field): Result<{ projectedPpg: number; priorSeasonPpg: number | null }> {
  const projected = parsePpg(text(field("projectedPpg")), false);
  const prior = parsePpg(text(field("priorSeasonPpg")), true);
  if (projected === undefined || projected === null) {
    return { ok: false, error: "Projected PPG is a number from 0 to 60 (up to 2 decimals)." };
  }
  if (prior === undefined) return { ok: false, error: "Last season's PPG is blank or a number from 0 to 60." };
  return { ok: true, value: { projectedPpg: projected, priorSeasonPpg: prior } };
}

export const SALARY_MIN = 5;
export const SALARY_MAX = 30;

export function parseSalary(value: FormDataEntryValue | null): Result<number> {
  const salary = wholeNumber(text(value), SALARY_MIN, SALARY_MAX);
  return salary === null
    ? { ok: false, error: `Salaries are whole numbers from ${SALARY_MIN} to ${SALARY_MAX}.` }
    : { ok: true, value: salary };
}

export function parseCfbdId(value: FormDataEntryValue | null): Result<number> {
  const id = wholeNumber(text(value), 1, MAX_INT);
  return id === null ? { ok: false, error: "Enter the player's CFBD ID (a whole number)." } : { ok: true, value: id };
}

/** Player IDs in URLs and hidden fields: any non-zero whole number (negative = hand-added). */
export function parsePlayerId(value: unknown): number | null {
  if (typeof value !== "string" || !/^-?\d{1,10}$/.test(value)) return null;
  const n = Number(value);
  return n !== 0 && Math.abs(n) <= MAX_INT ? n : null;
}

/** An optional week for a job run: blank, or 1 to 20. */
export function parseJobWeek(value: FormDataEntryValue | null): Result<number | null> {
  const t = text(value);
  if (t === "") return { ok: true, value: null };
  const week = wholeNumber(t, 1, 20);
  return week === null ? { ok: false, error: "Week is blank or a number from 1 to 20." } : { ok: true, value: week };
}
