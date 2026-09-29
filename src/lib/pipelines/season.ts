import type { CfbdGame } from "@/lib/cfbd/types";

export const SEC = "SEC";

/** Only SEC-vs-SEC games count: their players make up the week's pool. */
export function isContestGame(game: CfbdGame): boolean {
  return game.conferenceGame && game.homeConference === SEC && game.awayConference === SEC;
}

/** SEC teams that appear in a season's games. */
export function secTeams(games: CfbdGame[]): string[] {
  const teams = new Set<string>();
  for (const game of games) {
    if (game.homeConference === SEC) teams.add(game.homeTeam);
    if (game.awayConference === SEC) teams.add(game.awayTeam);
  }
  return [...teams].sort();
}

/** The college football season a date falls in: August through July. */
export function seasonFor(date: Date): number {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 6 ? year : year - 1;
}

export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
