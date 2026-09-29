// The parts of CollegeFootballData API responses the pipelines use. Field
// names and types follow the official `cfbd` client (v5).

export type CfbdSeasonType = "regular" | "postseason";

export type CfbdRosterPlayer = {
  id: string;
  firstName: string;
  lastName: string;
  team: string;
  /** Class year (1 = freshman). */
  year: number;
  position: string | null;
  recruitIds: string[] | null;
};

export type CfbdGame = {
  id: number;
  season: number;
  week: number;
  seasonType: string;
  startDate: string;
  startTimeTBD: boolean;
  completed: boolean;
  conferenceGame: boolean;
  homeTeam: string;
  homeConference: string | null;
  awayTeam: string;
  awayConference: string | null;
};

export type CfbdGamePlayerStatPlayer = {
  id: string;
  name: string;
  stat: string;
};

export type CfbdGamePlayerStats = {
  id: number;
  teams: {
    team: string;
    conference: string | null;
    homeAway: "home" | "away";
    points: number | null;
    categories: {
      name: string;
      types: { name: string; athletes: CfbdGamePlayerStatPlayer[] }[];
    }[];
  }[];
};

export type CfbdRecruit = {
  id: string;
  athleteId: string | null;
  year: number;
  name: string;
  committedTo: string | null;
  position: string | null;
  stars: number | null;
};
