import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/auth/validation";

export const metadata: Metadata = { title: "Sign in | SEC Gridiron 100" };

const NOTICES: Record<string, string> = {
  link: "That link has expired or was already used. Sign in, or ask for a new link.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const notice = typeof params.error === "string" ? NOTICES[params.error] : undefined;
  const signupHref = next === "/" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`;

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Your lineup is waiting."
      footer={
        <>
          New here?&nbsp;
          <Link href={signupHref} className="font-medium text-foreground underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <GoogleButton next={next} />
      <OrDivider />
      <LoginForm next={next} notice={notice} />
    </AuthCard>
  );
}
