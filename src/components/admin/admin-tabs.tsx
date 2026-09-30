"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Players", match: (p: string) => p === "/admin" || p.startsWith("/admin/players") },
  { href: "/admin/log", label: "Change log", match: (p: string) => p.startsWith("/admin/log") },
  { href: "/admin/jobs", label: "Jobs", match: (p: string) => p.startsWith("/admin/jobs") },
];

/** Players / Change log / Jobs. */
export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex w-full rounded-xl bg-card p-1 sm:w-96">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-[38px] flex-1 items-center justify-center rounded-[9px] text-sm transition-colors",
              active ? "bg-primary font-extrabold text-primary-foreground" : "font-semibold text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
