import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { SignupForm } from "@/components/auth/signup-form";
import { safeNextPath } from "@/lib/auth/validation";

export const metadata: Metadata = { title: "Create an account | SEC Gridiron 100" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const next = safeNextPath((await searchParams).next);
  const loginHref = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <AuthCard
      title="Create an account"
      description="Free to play. Pick seven SEC players under a 100-credit cap every week."
      footer={
        <>
          Already playing?&nbsp;
          <Link href={loginHref} className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton next={next} />
      <OrDivider />
      <SignupForm next={next} />
    </AuthCard>
  );
}
