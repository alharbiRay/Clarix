import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runJobs } from "@/lib/jobs/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Sweeps due background jobs (retries, and anything an inline run didn't
 * finish). Called by Vercel Cron (GET, which sends `Authorization: Bearer
 * $CRON_SECRET` automatically) and by the GitHub Actions schedule in
 * .github/workflows/process-jobs.yml (POST). Safe to call concurrently —
 * claim_jobs leases rows with `skip locked`.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Job runner is not configured" }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runJobs({ limit: 10 });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error(JSON.stringify({ event: "jobs.sweep_failed", error: String(e) }));
    return NextResponse.json({ ok: false, error: "Job sweep failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
