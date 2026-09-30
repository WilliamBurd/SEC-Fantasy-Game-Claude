"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const EVERY_MS = 60_000;

/** While games are on, re-fetches the page's scores every minute (when the tab is visible). */
export function AutoRefresh({ live }: { live: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [live, router]);

  if (!live) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
      <span className="size-[7px] animate-pulse rounded-full bg-primary" aria-hidden />
      Live · refreshes every minute
    </span>
  );
}
