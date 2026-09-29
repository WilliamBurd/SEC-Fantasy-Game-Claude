import type { CfbdGamePlayerStats } from "@/lib/cfbd/types";

/** One player's scoring stats from one game (column names match the database). */
export type StatLine = {
  player_id: number;
  game_id: number;
  team: string;
  pass_att: number;
  pass_yds: number;
  pass_td: number;
  interceptions: number;
  rush_att: number;
  rush_yds: number;
  rush_td: number;
  receptions: number;
  rec_yds: number;
  rec_td: number;
  fumbles_lost: number;
};

type StatColumn = Exclude<keyof StatLine, "player_id" | "game_id" | "team">;

// CFBD box score category -> stat type -> our column. Other categories
// (defense, kicking, ...) and stat types (AVG, LONG, QBR, ...) are ignored.
// Attempts and carries don't score; they measure a player's role (starter share).
const COLUMNS: Record<string, Record<string, StatColumn>> = {
  passing: { "C/ATT": "pass_att", YDS: "pass_yds", TD: "pass_td", INT: "interceptions" },
  rushing: { CAR: "rush_att", YDS: "rush_yds", TD: "rush_td" },
  receiving: { REC: "receptions", YDS: "rec_yds", TD: "rec_td" },
  fumbles: { LOST: "fumbles_lost" },
};

function emptyLine(playerId: number, gameId: number, team: string): StatLine {
  return {
    player_id: playerId,
    game_id: gameId,
    team,
    pass_att: 0,
    pass_yds: 0,
    pass_td: 0,
    interceptions: 0,
    rush_att: 0,
    rush_yds: 0,
    rush_td: 0,
    receptions: 0,
    rec_yds: 0,
    rec_td: 0,
    fumbles_lost: 0,
  };
}

function parseStat(value: string): number {
  // C/ATT arrives as "completions/attempts"; keep the attempts.
  const n = Number.parseInt(value.includes("/") ? value.slice(value.indexOf("/") + 1) : value, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Turns CFBD /games/players box scores into one stat line per player per
 * game. Every listed player gets a line, even with all zeros, so a line
 * means "played in this game". Team-total rows (non-positive ids) are skipped.
 */
export function parseGamePlayerStats(games: CfbdGamePlayerStats[]): StatLine[] {
  const lines = new Map<string, StatLine>();

  for (const game of games) {
    for (const team of game.teams) {
      for (const category of team.categories) {
        const columns = COLUMNS[category.name.toLowerCase()];
        for (const type of category.types) {
          const column = columns?.[type.name.toUpperCase()];
          for (const athlete of type.athletes) {
            const playerId = Number(athlete.id);
            if (!Number.isSafeInteger(playerId) || playerId <= 0) continue;

            const key = `${game.id}:${playerId}`;
            let line = lines.get(key);
            if (!line) {
              line = emptyLine(playerId, game.id, team.team);
              lines.set(key, line);
            }
            if (column) line[column] = parseStat(athlete.stat);
          }
        }
      }
    }
  }

  return [...lines.values()];
}

/** Player id -> name as listed in the box scores (for flagging unknown players). */
export function playerNames(games: CfbdGamePlayerStats[]): Map<number, string> {
  const names = new Map<number, string>();
  for (const game of games) {
    for (const team of game.teams) {
      for (const category of team.categories) {
        for (const type of category.types) {
          for (const athlete of type.athletes) {
            const id = Number(athlete.id);
            if (Number.isSafeInteger(id) && id > 0) names.set(id, athlete.name);
          }
        }
      }
    }
  }
  return names;
}

/** True when a line has any stat that scores points. */
export function hasScoringStats(line: StatLine): boolean {
  return (
    line.pass_yds !== 0 || line.pass_td !== 0 || line.interceptions !== 0 ||
    line.rush_yds !== 0 || line.rush_td !== 0 ||
    line.receptions !== 0 || line.rec_yds !== 0 || line.rec_td !== 0 ||
    line.fumbles_lost !== 0
  );
}
