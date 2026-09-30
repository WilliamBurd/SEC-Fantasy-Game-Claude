import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { getProfile, requireUser } from "@/lib/auth/dal";
import { safeNextPath, suggestUsername } from "@/lib/auth/validation";

import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Pick a username | SEC Gridiron 100" };

/** Every signed-in user, however they signed up, picks a username here once. */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const next = safeNextPath((await searchParams).next);
  const user = await requireUser("/onboarding");
  if (await getProfile()) redirect(next);

  return (
    <AuthCard title="Pick a username" description="One last step. This is how other players will see you.">
      <OnboardingForm next={next} suggestion={suggestUsername(user.email)} />
    </AuthCard>
  );
}
