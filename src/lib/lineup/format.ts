/**
 * Dates and times for the builder, always in US Eastern (like TV listings),
 * so the server and the browser render the same text.
 */

const TIME_ZONE = "America/New_York";

const dayFormat = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short", month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const longDayFormat = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "short", day: "numeric" });
const clockFormat = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// Some runtimes put a narrow no-break space before "PM"; use plain spaces so
// the server's text matches the browser's.
const plain = (text: string) => text.replace(/\s/g, " ");

/**
 * CFBD gives games without a set time a kickoff of midnight Eastern. Those
 * players still lock at that time until the Tuesday roster check brings in
 * the real one.
 */
export function isTimeTba(iso: string): boolean {
  return clockFormat.format(new Date(iso)) === "00:00";
}

/** "Sat, Oct 3 · 3:30 PM ET", or "Sat, Oct 10 · time TBA". */
export function formatKickoff(iso: string): string {
  const date = new Date(iso);
  const time = isTimeTba(iso) ? "time TBA" : `${timeFormat.format(date)} ET`;
  return plain(`${dayFormat.format(date)} · ${time}`);
}

/** "Tuesday, Oct 6". */
export function formatDay(iso: string): string {
  return plain(longDayFormat.format(new Date(iso)));
}

/** "12.4", or "–" when there's no number. */
export function formatPpg(value: number | null): string {
  return value === null ? "–" : value.toFixed(1);
}

/** "Wed, Sep 30 · 3:15 PM ET", for timestamps such as change log entries. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return plain(`${dayFormat.format(date)} · ${timeFormat.format(date)} ET`);
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * "Locks in 2h 05m" when a kickoff is within 24 hours, "Locks in 45m" within
 * the hour, "Locks in under a minute" at the end; null further out, or once
 * it has kicked off.
 */
export function lockCountdown(kickoffAt: string, now: Date): string | null {
  const left = new Date(kickoffAt).getTime() - now.getTime();
  if (left <= 0 || left > 24 * HOUR_MS) return null;
  if (left < MINUTE_MS) return "Locks in under a minute";
  const hours = Math.floor(left / HOUR_MS);
  const minutes = Math.floor((left % HOUR_MS) / MINUTE_MS);
  return hours > 0 ? `Locks in ${hours}h ${String(minutes).padStart(2, "0")}m` : `Locks in ${minutes}m`;
}
