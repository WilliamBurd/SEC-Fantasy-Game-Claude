import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The band under the site header on every main page: a small gold label, the
 * page title in the display face, and an optional figure on the right (credits
 * left, a score). Ends in the gold rule that marks the app's style.
 */
export function PageHeader({
  eyebrow,
  title,
  aside,
  width = "max-w-5xl",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  aside?: ReactNode;
  width?: string;
}) {
  return (
    <div className="border-b-2 border-primary bg-header">
      <div className={cn("mx-auto flex w-full items-end justify-between gap-4 px-4 pt-5 pb-4", width)}>
        <div className="min-w-0">
          {eyebrow && <p className="text-xs font-bold tracking-[0.1em] text-primary uppercase">{eyebrow}</p>}
          <h1 className="mt-0.5 font-display text-4xl leading-none font-bold break-words">{title}</h1>
        </div>
        {aside && <div className="shrink-0 text-right">{aside}</div>}
      </div>
    </div>
  );
}

/** A big gold figure with a small caption, for PageHeader's `aside`. */
export function HeaderFigure({ value, label, tone = "gold" }: { value: ReactNode; label: string; tone?: "gold" | "danger" }) {
  return (
    <div className="flex flex-col items-end">
      <span className={cn("font-display text-[40px] leading-[0.95] font-extrabold", tone === "gold" ? "text-primary" : "text-destructive")}>
        {value}
      </span>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
    </div>
  );
}
