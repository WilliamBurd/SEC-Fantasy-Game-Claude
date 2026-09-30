import { timingSafeEqual } from "node:crypto";

/** CRON_SECRET without stray spaces or line breaks picked up when it was pasted. */
export function cronSecret(raw: string | undefined = process.env.CRON_SECRET): string | null {
  const secret = raw?.trim();
  return secret ? secret : null;
}

/**
 * Whether an Authorization header carries the job secret ("Bearer <secret>").
 * Spaces around the secret on either side are ignored, so a copy pasted with
 * a trailing space or newline still matches.
 */
export function isJobAuthorized(header: string | null, secret: string | null): boolean {
  if (!secret || !header) return false;
  const match = /^\s*Bearer\s+(.+?)\s*$/i.exec(header);
  if (!match) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(match[1]);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
