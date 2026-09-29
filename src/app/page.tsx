import { getSupabaseEnv } from "@/lib/supabase/env";

export default function Home() {
  const supabaseConfigured = getSupabaseEnv() !== null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">SEC Gridiron 100</h1>
      <p className="text-muted-foreground">
        Weekly SEC fantasy football. Draft seven players under a 100-credit cap.
      </p>
      <p className="text-sm">
        Supabase:{" "}
        {supabaseConfigured ? (
          <span className="font-medium">configured</span>
        ) : (
          <span className="font-medium text-destructive">
            not configured (copy .env.example to .env.local)
          </span>
        )}
      </p>
    </main>
  );
}
