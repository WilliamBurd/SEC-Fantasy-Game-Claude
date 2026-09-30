import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { FormMessage } from "@/components/auth/form-message";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Choose a new password | SEC Gridiron 100" };

/** Reached from the reset email, which signs the user in first (via /auth/callback). */
export default async function ResetPasswordPage() {
  const user = await getUser();
  return (
    <AuthCard title="Choose a new password">
      {user ? (
        <ResetPasswordForm />
      ) : (
        <>
          <FormMessage error="Your reset link has expired or was already used." />
          <Link href="/forgot-password" className="text-sm font-medium underline-offset-4 hover:underline">
            Send a new link
          </Link>
        </>
      )}
    </AuthCard>
  );
}
