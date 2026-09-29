import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { CfbdClient } from "@/lib/cfbd/client";
import { isJobName, JOB_NAMES, runJob } from "@/lib/pipelines/jobs";
import { createAdminClient } from "@/lib/supabase/admin";

// The pre-season setup makes about 39 CFBD calls and can take a few minutes.
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseIntParam(value: string | null): number | undefined | null {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/**
 * Runs a data pipeline: /api/jobs/<job>?season=2026&week=7 (both optional).
 * `force=1` runs the injury report outside its Wednesday-to-game-day window.
 * Requires `Authorization: Bearer <CRON_SECRET>`, which Vercel Cron sends
 * automatically. GET is for Vercel Cron; POST for running a job by hand.
 */
async function handle(request: NextRequest, ctx: RouteContext<"/api/jobs/[job]">) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 500 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { job } = await ctx.params;
  if (!isJobName(job)) {
    return NextResponse.json({ error: `Unknown job. Jobs: ${JOB_NAMES.join(", ")}.` }, { status: 404 });
  }

  const season = parseIntParam(request.nextUrl.searchParams.get("season"));
  const week = parseIntParam(request.nextUrl.searchParams.get("week"));
  if (season === null || week === null) {
    return NextResponse.json({ error: "season and week must be whole numbers." }, { status: 400 });
  }

  try {
    const result = await runJob(
      { db: createAdminClient(), cfbd: CfbdClient.fromEnv(), now: new Date() },
      job,
      { season, week, force: request.nextUrl.searchParams.get("force") === "1" },
    );
    return NextResponse.json({ job, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Job ${job} failed:`, error);
    return NextResponse.json({ job, error: message }, { status: 500 });
  }
}

export { handle as GET, handle as POST };
