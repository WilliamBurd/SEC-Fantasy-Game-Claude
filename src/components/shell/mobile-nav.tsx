"use client";

import { Menu, Shield } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { isActive, NAV_ITEMS } from "./nav-links";

/** The menu button and slide-out panel on small screens. */
export function MobileNav({ signedIn, isAdmin }: { signedIn: boolean; isAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = isAdmin ? [...NAV_ITEMS, { href: "/admin", label: "Admin", icon: Shield }] : NAV_ITEMS;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetTitle>SEC Gridiron 100</SheetTitle>
        <SheetDescription className="sr-only">Site navigation</SheetDescription>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {items.map(({ href, label, icon: Icon }) => (
            <SheetClose asChild key={href}>
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
                  isActive(pathname, href) && "bg-accent text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            </SheetClose>
          ))}
        </nav>
        {!signedIn && (
          <div className="mt-auto flex flex-col gap-2">
            <SheetClose asChild>
              <Button asChild>
                <Link href="/signup">Create an account</Link>
              </Button>
            </SheetClose>
            <SheetClose asChild>
              <Button asChild variant="outline">
                <Link href="/login">Sign in</Link>
              </Button>
            </SheetClose>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
