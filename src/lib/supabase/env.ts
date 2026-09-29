// Public Supabase settings. Both are safe to expose to the browser: access is
// controlled by Row Level Security in the database, not by hiding these values.

/** Trims spaces and surrounding quotes, which are easy to paste into a hosting dashboard. */
function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
}

/**
 * The project URL as the Supabase client wants it: `https://<ref>.supabase.co`.
 * Accepts common paste mistakes (quotes, a missing `https://`, a trailing
 * `/rest/v1/`) and returns null for anything that still isn't a URL.
 */
export function normalizeSupabaseUrl(value: string | undefined): string | null {
  let url = clean(value);
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export function getSupabaseEnv() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function requireSupabaseEnv() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co) and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).",
    );
  }
  return env;
}
