import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_PRICING_SETTINGS,
  DEFAULT_SEASON_SETTINGS,
  withDefaults,
  type PricingSettings,
  type SeasonSettings,
} from "@/lib/pricing/settings";

export type Db = SupabaseClient;

const PAGE_SIZE = 1000; // Supabase's default maximum rows per request.
const CHUNK_SIZE = 500;

export function check(error: PostgrestError | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/** Reads every row of a query, a page at a time. */
export async function selectAll<T>(
  context: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    check(error, context);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/**
 * Upserts rows in chunks. Every row in one call must have the same keys:
 * columns left out keep their current value on existing rows.
 */
export async function upsertAll(db: Db, table: string, rows: object[], onConflict: string) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + CHUNK_SIZE), { onConflict });
    check(error, `upsert ${table}`);
  }
}

/** Which of these weeks have prices (a player_weekly_stats row): one tiny count per week. */
export async function loadPricedWeeks(db: Db, season: number, weeks: number[]): Promise<Set<number>> {
  const counts = await Promise.all(
    weeks.map(async (week) => {
      const { count, error } = await db
        .from("player_weekly_stats")
        .select("player_id", { count: "exact", head: true })
        .eq("season", season)
        .eq("week", week);
      check(error, "count priced players");
      return [week, count ?? 0] as const;
    }),
  );
  return new Set(counts.filter(([, count]) => count > 0).map(([week]) => week));
}

export async function loadSettings(db: Db): Promise<{ pricing: PricingSettings; season: SeasonSettings }> {
  const { data, error } = await db.from("app_settings").select("key, value");
  check(error, "load settings");
  const byKey = new Map((data ?? []).map((row) => [row.key as string, row.value as unknown]));
  return {
    pricing: withDefaults(DEFAULT_PRICING_SETTINGS, byKey.get("pricing")),
    season: withDefaults(DEFAULT_SEASON_SETTINGS, byKey.get("season")),
  };
}

export type ChangeLogEntry = { action: string; player_id?: number | null; details?: object };

/** Records automated changes (changed_by = NULL) for the admin screen. */
export async function logChanges(db: Db, entries: ChangeLogEntry[]) {
  const rows = entries.map((e) => ({
    changed_by: null,
    action: e.action,
    player_id: e.player_id ?? null,
    details: e.details ?? null,
  }));
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const { error } = await db.from("change_log").insert(rows.slice(i, i + CHUNK_SIZE));
    check(error, "write change log");
  }
}
