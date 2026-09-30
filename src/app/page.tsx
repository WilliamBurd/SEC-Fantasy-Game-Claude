import { ClipboardList, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FormMessage } from "@/components/auth/form-message";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { getProfile, getUser } from "@/lib/auth/dal";
import { getSupabaseEnv } from "@/lib/supabase/env";

const SECTIONS = [
  { href: "/lineup", title: "Lineup", text: "Pick seven SEC players under the 100-credit cap.", icon: ClipboardList },
  { href: "/leaderboard", title: "Leaderboard", text: "See where you rank this week and this season.", icon: Trophy },
  { href: "/leagues", title: "Leagues", text: "Play against friends with an invite code.", icon: Users },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const user = await getUser();
  const profile = user ? await getProfile() : null;
  if (user && !profile) redirect("/onboarding");

  if (profile) {
    return (
      <>
        <PageHeader eyebrow="Welcome back" title={profile.username} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {params.password === "updated" && (
            <div className="mb-6">
              <FormMessage message="Your password has been changed." />
            </div>
          )}
          <p className="text-muted-foreground">Set your lineup before your players kick off.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {SECTIONS.map(({ href, title, text, icon: Icon }) => (
              <Link key={href} href={href} className="group rounded-xl bg-card p-5 transition-colors hover:bg-accent">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Icon className="size-5" />
                </span>
                <h2 className="mt-3 font-display text-2xl font-bold">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </Link>
            ))}
          </div>
        </main>
      </>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="font-display text-6xl leading-none font-extrabold sm:text-7xl">
        SEC Gridiron <span className="text-primary">100</span>
      </h1>
      <p className="text-lg text-muted-foreground">
        Weekly SEC fantasy football. Draft seven players under a 100-credit cap, score with standard PPR, and
        change anyone whose game hasn&apos;t kicked off yet. Free to play.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/signup">Create an account</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
      {!getSupabaseEnv() && (
        <p className="text-sm text-destructive">
          Supabase is not configured (check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).
        </p>
      )}
    </main>
  );
}
