import type {
  CfbdGame,
  CfbdGamePlayerStats,
  CfbdRecruit,
  CfbdRosterPlayer,
  CfbdSeasonType,
} from "./types";

const BASE_URL = "https://api.collegefootballdata.com";

type Query = Record<string, string | number | undefined>;

export class CfbdError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CfbdError";
  }
}

// Minimal CollegeFootballData API client. Each method is one API call, which
// counts against the account's monthly call allowance.
export class CfbdClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static fromEnv() {
    const apiKey = process.env.CFBD_API_KEY;
    if (!apiKey) throw new Error("CFBD_API_KEY is not set (see .env.example).");
    return new CfbdClient(apiKey);
  }

  private async get<T>(path: string, query: Query): Promise<T> {
    const url = new URL(path, BASE_URL);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new CfbdError(
        `CFBD ${path} failed with ${response.status}: ${body.slice(0, 200)}`,
        response.status,
      );
    }
    return (await response.json()) as T;
  }

  /** Every game involving a team from `conference` (non-conference games included). */
  games(year: number, conference: string, seasonType: CfbdSeasonType = "regular") {
    return this.get<CfbdGame[]>("/games", { year, conference, seasonType });
  }

  roster(team: string, year: number) {
    return this.get<CfbdRosterPlayer[]>("/roster", { team, year });
  }

  /**
   * Box score stats by game. CFBD requires `week`, `team` or `conference`
   * alongside `year`.
   */
  gamePlayerStats(query: {
    year: number;
    week?: number;
    conference?: string;
    team?: string;
    seasonType?: CfbdSeasonType;
    classification?: "fbs";
  }) {
    return this.get<CfbdGamePlayerStats[]>("/games/players", query);
  }

  recruits(year: number, team?: string) {
    return this.get<CfbdRecruit[]>("/recruiting/players", { year, team });
  }
}
