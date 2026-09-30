import type { Metadata } from "next";

import { JobCard } from "@/components/admin/admin-forms";
import { JOB_INFO, JOB_ORDER } from "@/lib/admin/jobs";
import { requireAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Jobs | SEC Gridiron 100" };

// Waiting on a job can take a few minutes (the pre-season setup most of all).
export const maxDuration = 300;

export default async function JobsPage() {
  await requireAdmin("/admin/jobs");
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-muted-foreground">
        These run on their own schedule. Run one here to catch up after a failure or a late change. Each run is the
        same as the scheduled one, and what it changes appears in the change log.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {JOB_ORDER.map((job) => (
          <JobCard key={job} job={job} info={JOB_INFO[job]} />
        ))}
      </div>
    </div>
  );
}
