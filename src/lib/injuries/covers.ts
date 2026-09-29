/**
 * Reads the Covers college football injury report
 * (https://www.covers.com/sport/football/ncaaf/injuries). The page is plain
 * server-rendered HTML: one <section> per FBS team with the team's name, a
 * "(N)" count of listed players, then a table row per player:
 *
 *   <span class='player-link'> K. Lacy </span>   <td>RB</td>
 *   <td><b>Out - Shoulder</b><br>( Sat, Sep 26)</td>
 *   ... <div class="... injuryCopy"> Lacy is nursing a shoulder injury ... </div>
 *
 * Parsing is pure so it can be tested against a saved copy of the page.
 */

export const COVERS_INJURIES_URL = "https://www.covers.com/sport/football/ncaaf/injuries";

export type InjuryStatus = "out" | "doubtful" | "questionable" | "probable";

export type CoversInjury = {
  /** As Covers prints it: first initial and last name, e.g. "K. Lacy". */
  name: string;
  position: string;
  /** The raw status text, e.g. "Out - Shoulder". */
  statusText: string;
  /** null when the status isn't one we recognise. */
  status: InjuryStatus | null;
  /** The injury, e.g. "Shoulder" or "Undisclosed". */
  injury: string | null;
  /** When Covers last updated the entry, as printed: "Sat, Sep 26". */
  dateText: string | null;
  note: string | null;
};

export type CoversTeam = {
  team: string;
  /** The "(N)" count printed next to the team name. */
  listedCount: number;
  injuries: CoversInjury[];
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeHtml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Strips tags, decodes entities and collapses whitespace. */
function text(html: string): string {
  return decodeHtml(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** "Out", "IR" and "Out For Season" all mean the player won't play. */
export function normalizeStatus(status: string): InjuryStatus | null {
  const s = status.trim().toLowerCase();
  if (s.startsWith("out") || s === "ir" || s.includes("injured reserve") || s.startsWith("suspended")) return "out";
  if (s.startsWith("doubtful")) return "doubtful";
  if (s.startsWith("questionable") || s.startsWith("day-to-day") || s.startsWith("game-time")) return "questionable";
  if (s.startsWith("probable")) return "probable";
  return null;
}

const TEAM_NAME = /covers-CoversMatchups-teamName">\s*<a[^>]*>([\s\S]*?)<br>/;
const LISTED_COUNT = /<div class="col-xs-2 col-sm-3">\s*\(\s*(\d+)\s*\)\s*<\/div>/;
const PLAYER_ROW =
  /<span class='player-link'>([\s\S]*?)<\/span>\s*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>\s*<b>([\s\S]*?)<\/b>(?:\s*<br>\s*\(([^)]*)\))?[\s\S]*?(?:injuryCopy">([\s\S]*?)<\/div>|(?=<span class='player-link'>)|$)/g;

/** Every team section on the page, in page order. */
export function parseCoversInjuries(html: string): CoversTeam[] {
  const teams: CoversTeam[] = [];
  for (const section of html.split("<section>").slice(1)) {
    const body = section.split("</section>")[0];
    const name = body.match(TEAM_NAME);
    const count = body.match(LISTED_COUNT);
    if (!name || !count) continue;

    const injuries: CoversInjury[] = [];
    for (const row of body.matchAll(PLAYER_ROW)) {
      const statusText = text(row[3]);
      const [status, ...injury] = statusText.split(" - ");
      injuries.push({
        name: text(row[1]),
        position: text(row[2]).toUpperCase(),
        statusText,
        status: normalizeStatus(status),
        injury: injury.length > 0 ? injury.join(" - ").trim() || null : null,
        dateText: row[4] ? text(row[4]) || null : null,
        note: row[5] ? text(row[5]) || null : null,
      });
    }
    teams.push({ team: text(name[1]), listedCount: Number(count[1]), injuries });
  }
  return teams;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Covers prints dates without a year ("Sat, Sep 26"). Returns the most recent
 * such date on or before `now` (plus a day's grace for time zones), as
 * YYYY-MM-DD, so a December entry read in January lands in the right year.
 */
export function reportedOn(dateText: string | null, now: Date): string | null {
  const match = dateText?.match(/([a-z]{3})[a-z]*\.?\s+(\d{1,2})\s*$/i);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1].toLowerCase());
  const day = Number(match[2]);
  if (month < 0 || day < 1 || day > 31) return null;
  let year = now.getUTCFullYear();
  if (Date.UTC(year, month, day) > now.getTime() + 24 * 60 * 60 * 1000) year -= 1;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month) return null; // e.g. Feb 30
  return date.toISOString().slice(0, 10);
}

/** Fetches the report page (one request, about 1.3 MB). */
export async function fetchCoversInjuries(fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(COVERS_INJURIES_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SECGridiron100/1.0; injury report)",
      Accept: "text/html",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Covers injury report failed with ${response.status}`);
  return response.text();
}
