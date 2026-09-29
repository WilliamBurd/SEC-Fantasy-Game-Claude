import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { decodeHtml, normalizeStatus, parseCoversInjuries, reportedOn } from "./covers";

// A trimmed copy of the real page from Sep 29, 2026: Alabama, App State (no
// injuries), Delaware, Mississippi, Texas and Texas A&M.
const page = readFileSync(join(__dirname, "fixtures/covers-injuries.html"), "utf8");

const row = (name: string, position: string, status: string, date = "( Sat, Sep 26)", note = "") => `
  <tr> <td> <span class='player-link'> ${name} </span> </td> <td>${position}</td>
  <td><b>${status}</b><br>${date}</td> <td><a class="covers-CoversMatchups-injuryLink collapsed"></a></td> </tr>
  ${note ? `<tr class="collapse"><td colspan="4"><div class="col-xs-12 covers-CoversMatchups-injuryCopy"> ${note} </div></td></tr>` : ""}`;

const section = (team: string, count: number, rows: string) => `
  <section><div class="row"><div class="col-xs-5"><div class="covers-CoversMatchups-teamName">
  <a class="covers-CoversMatchups-imgLink" href="#"> ${team}<br><span>Nickname</span> </a></div></div>
  <div class="col-xs-2 col-sm-3"> (${count}) </div></div>
  <table class="table table-sm covers-CoversMatchups-Table"><tbody>${rows}</tbody></table></section>`;

describe("parseCoversInjuries", () => {
  const teams = parseCoversInjuries(page);

  it("reads every team section, including teams with nobody listed", () => {
    expect(teams.map((t) => t.team)).toEqual([
      "Alabama",
      "Appalachian State",
      "Delaware",
      "Mississippi",
      "Texas",
      "Texas A&M",
    ]);
    expect(teams.find((t) => t.team === "Appalachian State")).toMatchObject({ listedCount: 0, injuries: [] });
  });

  it("reads as many players as each team's printed count", () => {
    for (const team of teams) expect(team.injuries).toHaveLength(team.listedCount);
  });

  it("reads name, position, status, injury, date and note", () => {
    const olemiss = teams.find((t) => t.team === "Mississippi")!;
    expect(olemiss.injuries[0]).toEqual({
      name: "K. Lacy",
      position: "RB",
      statusText: "Out - Shoulder",
      status: "out",
      injury: "Shoulder",
      dateText: "Sat, Sep 26",
      note: "Lacy is nursing with a shoulder injury, and he is not projected to face against Gators on Saturday.",
    });
    const texas = teams.find((t) => t.team === "Texas")!;
    expect(texas.injuries.map((i) => [i.name, i.position, i.status])).toEqual([
      ["C. Coleman", "WR", "probable"],
      ["D. McCutcheon", "WR", "questionable"],
      ["T. Goosby", "OG", "questionable"],
      ["N. Townsend", "TE", "questionable"],
      ["H. Smothers", "RB", "questionable"],
    ]);
  });

  it("keeps suffixes and decodes entities", () => {
    const html = section("Texas A&amp;M", 2, row("T. Riden Jr.", "RB", "Out - Undisclosed") + row("A. O&#x27;Neal", "wr", "IR - Knee"));
    const [team] = parseCoversInjuries(html);
    expect(team.team).toBe("Texas A&M");
    expect(team.injuries.map((i) => [i.name, i.position, i.status, i.injury, i.note])).toEqual([
      ["T. Riden Jr.", "RB", "out", "Undisclosed", null],
      ["A. O'Neal", "WR", "out", "Knee", null],
    ]);
  });

  it("handles a row with no date or injury type", () => {
    const [team] = parseCoversInjuries(section("LSU", 1, row("J. Doe", "QB", "Questionable", "", "Game-time call.")));
    expect(team.injuries[0]).toMatchObject({ status: "questionable", injury: null, dateText: null, note: "Game-time call." });
  });

  it("finds nothing in a page without the injury tables", () => {
    expect(parseCoversInjuries("<html><body><h1>Access denied</h1></body></html>")).toEqual([]);
    expect(parseCoversInjuries("")).toEqual([]);
  });
});

describe("normalizeStatus", () => {
  it("maps the report's wording to our four statuses", () => {
    expect(normalizeStatus("Out")).toBe("out");
    expect(normalizeStatus("IR")).toBe("out");
    expect(normalizeStatus("Out For Season")).toBe("out");
    expect(normalizeStatus("Doubtful")).toBe("doubtful");
    expect(normalizeStatus("Questionable")).toBe("questionable");
    expect(normalizeStatus("Day-To-Day")).toBe("questionable");
    expect(normalizeStatus("Probable")).toBe("probable");
    expect(normalizeStatus("Healthy")).toBeNull();
  });
});

describe("decodeHtml", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeHtml("Texas A&amp;M, O&#x27;Neal, D&#39;Angelo, &quot;x&quot;")).toBe(`Texas A&M, O'Neal, D'Angelo, "x"`);
    expect(decodeHtml("&bogus;")).toBe("&bogus;");
  });
});

describe("reportedOn", () => {
  const now = new Date("2026-09-29T20:00:00Z");
  it("adds the year", () => {
    expect(reportedOn("Sat, Sep 26", now)).toBe("2026-09-26");
    expect(reportedOn("Thu, Aug 27", now)).toBe("2026-08-27");
  });
  it("puts a date after today in last year", () => {
    expect(reportedOn("Sat, Dec 27", new Date("2027-01-02T12:00:00Z"))).toBe("2026-12-27");
  });
  it("allows a day's grace for time zones", () => {
    expect(reportedOn("Wed, Sep 30", now)).toBe("2026-09-30");
  });
  it("returns null for anything else", () => {
    expect(reportedOn(null, now)).toBeNull();
    expect(reportedOn("soon", now)).toBeNull();
    expect(reportedOn("Mon, Feb 30", now)).toBeNull();
  });
});
