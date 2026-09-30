import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getProfile, getUser } from "@/lib/auth/dal";

import { MobileNav } from "./mobile-nav";
import { MainNav } from "./nav-links";
import { UserMenu } from "./user-menu";

/** The bar across the top of every page. */
export async function SiteHeader() {
  const user = await getUser();
  const profile = user ? await getProfile() : null;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4">
        <MobileNav signedIn={Boolean(user)} isAdmin={Boolean(profile?.is_admin)} />
        <Link href="/" className="mr-4 flex items-center gap-2 font-semibold tracking-tight">
          <span className="rounded bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">100</span>
          <span>SEC Gridiron</span>
        </Link>
        <MainNav />
        <div className="ml-auto flex items-center gap-2">
          {profile ? (
            <UserMenu username={profile.username} isAdmin={profile.is_admin} />
          ) : user ? (
            <Button asChild size="sm">
              <Link href="/onboarding">Finish signing up</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/signup">Create an account</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
