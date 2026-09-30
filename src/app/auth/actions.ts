"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth/dal";
import { safeNextPath, validateEmail, validatePassword } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = { error?: string; message?: string; email?: string } | undefined;

/** This site's address, for links in emails and the Google redirect. */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/** Re-renders every page, header included, after the signed-in user changes. */
function refreshSignedInState() {
  revalidatePath("/", "layout");
}

/** Supabase's messages, reworded for players. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Wrong email or password.";
  if (m.includes("email not confirmed")) return "Confirm your email first: check your inbox for the link.";
  if (m.includes("rate limit") || m.includes("security purposes")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (m.includes("provider is not enabled")) return "Google sign-in isn't set up yet. Use email for now.";
  if (m.includes("weak") || m.includes("password should")) return message;
  return "Something went wrong. Please try again.";
}

export async function signIn(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = validateEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  if ("error" in email) return { error: email.error };
  if (!password) return { error: "Enter your password.", email: email.email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.email, password });
  if (error) return { error: friendly(error.message), email: email.email };

  refreshSignedInState();
  redirect(safeNextPath(formData.get("next")));
}

export async function signUp(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = validateEmail(formData.get("email"));
  if ("error" in email) return { error: email.error };
  const password = validatePassword(formData.get("password"));
  if ("error" in password) return { error: password.error, email: email.email };

  const next = safeNextPath(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.email,
    password: password.password,
    options: {
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(`/onboarding?next=${next}`)}`,
    },
  });
  if (error) return { error: friendly(error.message), email: email.email };

  // With email confirmation off, the user is signed in straight away.
  if (data.session) {
    refreshSignedInState();
    redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  }
  return {
    message: `We've sent a link to ${email.email}. Open it to confirm your email and finish signing up.`,
  };
}

export async function signInWithGoogle(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const next = safeNextPath(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) return { error: friendly(error?.message ?? "") };
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  refreshSignedInState();
  redirect("/");
}

export async function requestPasswordReset(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = validateEmail(formData.get("email"));
  if ("error" in email) return { error: email.error };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/reset-password`,
  });
  if (error && friendly(error.message).startsWith("Too many")) return { error: friendly(error.message) };
  // Same answer whether or not the account exists, so the form can't be used to find accounts.
  return { message: `If there's an account for ${email.email}, we've sent it a link to reset the password.` };
}

export async function updatePassword(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!(await getUser())) return { error: "Your reset link has expired. Request a new one." };
  const password = validatePassword(formData.get("password"));
  if ("error" in password) return { error: password.error };
  if (password.password !== formData.get("confirm")) return { error: "The passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.password });
  if (error) return { error: friendly(error.message) };
  redirect("/?password=updated");
}
