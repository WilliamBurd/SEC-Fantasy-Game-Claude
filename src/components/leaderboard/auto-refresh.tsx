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
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <span className="size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
      Games in progress: this page refreshes every minute
    </span>
  );
}
