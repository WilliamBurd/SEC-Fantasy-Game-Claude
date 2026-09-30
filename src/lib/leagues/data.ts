import "server-only";

import { check, type Db } from "@/lib/pipelines/db";

/** A league as its members see it (RLS hides leagues the user isn't in). */
export type League = {
  id: string;
  name: string;
  inviteCode: string;
  isAdmin: boolean;
  members: number;
};

type LeagueRow = {
  id: string;
  name: string;
  invite_code: string;
  admin_id: string;
  league_members: { count: number }[];
};

const COLUMNS = "id, name, invite_code, admin_id, league_members(count)";

const toLeague = (row: LeagueRow, userId: string): League => ({
  id: row.id,
  name: row.name,
  inviteCode: row.invite_code,
  isAdmin: row.admin_id === userId,
  members: row.league_members[0]?.count ?? 0,
});

export async function listMyLeagues(db: Db, userId: string): Promise<League[]> {
  const { data, error } = await db.from("leagues").select(COLUMNS).order("name").overrideTypes<LeagueRow[], { merge: false }>();
  check(error, "load leagues");
  return (data ?? []).map((row) => toLeague(row, userId));
}

/** The league, or null if it doesn't exist or the user isn't a member. */
export async function getLeague(db: Db, id: string, userId: string): Promise<League | null> {
  const { data, error } = await db
    .from("leagues")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<LeagueRow, { merge: false }>();
  check(error, "load league");
  return data ? toLeague(data, userId) : null;
}
