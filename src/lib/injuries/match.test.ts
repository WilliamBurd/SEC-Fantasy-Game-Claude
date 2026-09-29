import { describe, expect, it } from "vitest";

import type { CoversInjury, CoversTeam } from "./covers";
import { matchInjuries, normalizeName, splitReportName, type MatchablePlayer } from "./match";

const injury = (name: string, position: string, status: CoversInjury["status"] = "out"): CoversInjury => ({
  name,
  position,
  statusText: status ?? "Unknown",
  status,
  injury: null,
  dateText: null,
  note: null,
});
const team = (name: string, injuries: CoversInjury[]): CoversTeam => ({ team: name, listedCount: injuries.length, injuries });

let nextId = 1;
const player = (first: string, last: string, teamName: string, position: MatchablePlayer["position"]): MatchablePlayer => ({
  id: nextId++,
  first_name: first,
  last_name: last,
  team: teamName,
  position,
});

const lacy = player("Kewan", "Lacy", "Ole Miss", "RB");
const smothers = player("Hollywood", "Smothers", "Texas", "RB");
const riden = player("Terry", "Riden", "Texas A&M", "RB");
const sategna = player("Isaiah", "Sategna III", "Oklahoma", "WR");
const oneal = player("André", "O'Neal", "Georgia", "WR");
const colemanWilliams = player("Ryan", "Coleman-Williams", "Alabama", "WR");
const jWilliamsWr = player("Jalen", "Williams", "Auburn", "WR");
const jWilliamsRb = player("Jordan", "Williams", "Auburn", "RB");
const tWilliamsA = player("Tyler", "Williams", "LSU", "WR");
const tWilliamsB = player("Trey", "Williams", "LSU", "WR");
const nickname = player("Deshawn", "Bishop", "Tennessee", "RB");
const vBrown = player("Vernell", "Brown III", "Florida", "WR");
const tBrown = player("Tripp", "Brown Jr.", "Florida", "TE");
const players = [
  lacy,
  smothers,
  riden,
  sategna,
  oneal,
  colemanWilliams,
  jWilliamsWr,
  jWilliamsRb,
  tWilliamsA,
  tWilliamsB,
  nickname,
  vBrown,
  tBrown,
];
const SEC = ["Alabama", "Auburn", "Florida", "Georgia", "LSU", "Oklahoma", "Ole Miss", "Tennessee", "Texas", "Texas A&M"];

describe("normalizeName", () => {
  it("ignores case, accents, punctuation and suffixes", () => {
    expect(normalizeName("Sategna III")).toBe("sategna");
    expect(normalizeName("Riden Jr.")).toBe("riden");
    expect(normalizeName("O’Neal")).toBe("oneal");
    expect(normalizeName("Coleman-Williams")).toBe("colemanwilliams");
    expect(normalizeName("Coleman Williams")).toBe("colemanwilliams");
    expect(normalizeName("Ándre")).toBe("andre");
  });
});

describe("splitReportName", () => {
  it("splits an initial and last name", () => {
    expect(splitReportName("K. Lacy")).toEqual({ initial: "k", last: "lacy" });
    expect(splitReportName("  T.   Riden Jr. ")).toEqual({ initial: "t", last: "riden" });
    expect(splitReportName("Kewan Lacy")).toEqual({ initial: "k", last: "lacy" });
    expect(splitReportName("V. Brown III")).toEqual({ initial: "v", last: "brown" });
    expect(splitReportName("Lacy")).toBeNull();
  });
});

describe("matchInjuries", () => {
  it("matches initial, last name and team, with Covers' team names mapped to ours", () => {
    const result = matchInjuries(
      [
        team("Mississippi", [injury("K. Lacy", "RB")]),
        team("Texas", [injury("H. Smothers", "RB", "questionable")]),
        team("Texas A&M", [injury("T. Riden Jr.", "RB")]),
        team("Oklahoma", [injury("I. Sategna", "WR")]),
        team("Georgia", [injury("A. O'Neal", "WR")]),
        team("Alabama", [injury("R. Coleman Williams", "WR")]),
        team("Florida", [injury("V. Brown III", "WR")]),
      ],
      players,
      SEC,
    );
    expect(result.matched.map((m) => [m.playerId, m.team, m.by])).toEqual([
      [lacy.id, "Ole Miss", "name"],
      [smothers.id, "Texas", "name"],
      [riden.id, "Texas A&M", "name"],
      [sategna.id, "Oklahoma", "name"],
      [oneal.id, "Georgia", "name"],
      [colemanWilliams.id, "Alabama", "name"],
      [vBrown.id, "Florida", "name"],
    ]);
    expect(result.unmatched).toEqual([]);
    expect(result.teamsInReport).toEqual(["Ole Miss", "Texas", "Texas A&M", "Oklahoma", "Georgia", "Alabama", "Florida"]);
  });

  it("uses position to tell apart players with the same initial and last name", () => {
    const result = matchInjuries([team("Auburn", [injury("J. Williams", "RB")])], players, SEC);
    expect(result.matched.map((m) => m.playerId)).toEqual([jWilliamsRb.id]);
  });

  it("logs a name it can't narrow to one player as ambiguous", () => {
    const result = matchInjuries([team("LSU", [injury("T. Williams", "WR")])], players, SEC);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual([
      { team: "LSU", injury: injury("T. Williams", "WR"), reason: "ambiguous", candidates: [tWilliamsA.id, tWilliamsB.id] },
    ]);
  });

  it("keeps the first entry when two point at the same player", () => {
    const result = matchInjuries([team("Tennessee", [injury("D. Bishop", "RB"), injury("X. Bishop", "RB")])], players, SEC);
    expect(result.matched).toEqual([
      { playerId: nickname.id, team: "Tennessee", injury: injury("D. Bishop", "RB"), by: "name" },
    ]);
    // The second entry points at the same player, so it's dropped rather than overwriting the first.
    expect(result.unmatched).toEqual([]);
  });

  it("matches a nickname by last name and position", () => {
    const result = matchInjuries([team("Tennessee", [injury("X. Bishop", "RB")])], players, SEC);
    expect(result.matched.map((m) => [m.playerId, m.by])).toEqual([[nickname.id, "last_name"]]);
  });

  it("reports names with no player, and treats FB as RB", () => {
    const result = matchInjuries(
      [team("Texas", [injury("C. Coleman", "WR"), injury("H. Smothers", "FB")])],
      players,
      SEC,
    );
    expect(result.matched.map((m) => m.playerId)).toEqual([smothers.id]);
    expect(result.unmatched).toEqual([{ team: "Texas", injury: injury("C. Coleman", "WR"), reason: "no_player" }]);
  });

  it("doesn't match across teams", () => {
    const result = matchInjuries([team("Georgia", [injury("K. Lacy", "RB")])], players, SEC);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toHaveLength(1);
  });

  it("skips other teams and positions we don't price", () => {
    const result = matchInjuries(
      [team("Delaware", [injury("G. Spiller", "RB")]), team("Texas", [injury("T. Goosby", "OG"), injury("J. Doe", "K")])],
      players,
      SEC,
    );
    expect(result).toEqual({ matched: [], unmatched: [], teamsInReport: ["Texas"] });
  });
});
