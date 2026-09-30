import type { ReactNode } from "react";

/** Placeholder for a page whose feature is still being built. */
export function ComingSoon({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-4 max-w-prose rounded-xl border border-dashed p-6 text-muted-foreground">{children}</div>
    </main>
  );
}
