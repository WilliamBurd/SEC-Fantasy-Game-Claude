import type { ReactNode } from "react";

import { PageHeader } from "./page-header";

/** Placeholder for a page whose feature is still being built. */
export function ComingSoon({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <PageHeader eyebrow="Coming soon" title={title} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="max-w-prose rounded-xl border border-dashed border-input p-6 text-muted-foreground">{children}</div>
      </main>
    </>
  );
}
