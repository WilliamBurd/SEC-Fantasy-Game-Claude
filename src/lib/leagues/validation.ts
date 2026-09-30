/** Checks for the league forms. Pure, for testing; the database checks again. */

export const LEAGUE_NAME_MAX = 50;

export function validateLeagueName(raw: unknown): { name: string } | { error: string } {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (name.length === 0) return { error: "Give your league a name." };
  if (name.length > LEAGUE_NAME_MAX) return { error: `League names can be up to ${LEAGUE_NAME_MAX} characters.` };
  return { name };
}

/** Accepts "abc123", "ABC 123" or "abc-123"; invite codes are 6 letters or numbers. */
export function normalizeInviteCode(raw: unknown): { code: string } | { error: string } {
  const code = (typeof raw === "string" ? raw : "").replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return { error: "Invite codes are 6 letters or numbers, like K7Q2XM." };
  return { code };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
