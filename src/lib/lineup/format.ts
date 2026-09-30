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
