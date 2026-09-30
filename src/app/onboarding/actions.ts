"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getProfile, getUser } from "@/lib/auth/dal";
import { safeNextPath, validateUsername } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = { error?: string; username?: string } | undefined;

/** Creates the signed-in user's profile with the username they picked. */
export async function createProfile(_state: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const next = safeNextPath(formData.get("next"));
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/onboarding")}`);
  if (await getProfile()) redirect(next);

  const result = validateUsername(formData.get("username"));
  if ("error" in result) return { error: result.error, username: String(formData.get("username") ?? "") };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").insert({ id: user.id, username: result.username });
  if (error) {
    // 23505: unique_violation (the case-insensitive username index).
    if (error.code === "23505") return { error: "That username is taken. Try another.", username: result.username };
    return { error: "Couldn't save your username. Please try again.", username: result.username };
  }
  revalidatePath("/", "layout"); // the header now shows the username
  redirect(next);
}
