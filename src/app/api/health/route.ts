import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness probe. Deliberately has no auth and no database dependency, so it
 * answers even when Supabase is degraded — that is exactly when you need to
 * know whether the app itself is up. Excluded from the middleware matcher.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    },
    { headers: { "cache-control": "no-store" } }
  );
}
