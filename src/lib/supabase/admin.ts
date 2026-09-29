import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseEnv } from "./env";

// Supabase client with the secret key. It bypasses Row Level Security, so use
// it only in trusted server code such as the scheduled data pipelines, and
// never import it into a Client Component.
export function createAdminClient() {
  const { url } = requireSupabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set (see .env.example).");
  }
  return createSupabaseClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
