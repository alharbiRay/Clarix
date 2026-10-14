import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const runJobs = vi.fn(async (_opts?: unknown) => ({ claimed: 2, succeeded: 2, retried: 0, failed: 0 }));
vi.mock("@/lib/jobs/run", () => ({ runJobs: (opts: unknown) => runJobs(opts) }));

import { GET, POST } from "@/app/api/jobs/process/route";

const req = (auth?: string, method = "GET") =>
  new NextRequest("https://clarix.test/api/jobs/process", {
    method,
    headers: auth ? { authorization: auth } : {},
  });

describe("/api/jobs/process", () => {
  beforeEach(() => {
    runJobs.mockClear();
    vi.stubEnv("CRON_SECRET", "s3cret-value-long-enough");
  });

  it("refuses to run when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(503);
    expect(runJobs).not.toHaveBeenCalled();
  });

  it.each([undefined, "Bearer wrong", "s3cret-value-long-enough", "Bearer s3cret-value-long-enoug"])(
    "rejects authorization %s",
    async (auth) => {
      expect((await GET(req(auth))).status).toBe(401);
      expect(runJobs).not.toHaveBeenCalled();
    }
  );

  it("runs due jobs with the right bearer secret (Vercel Cron uses GET)", async () => {
    const res = await GET(req("Bearer s3cret-value-long-enough"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, claimed: 2, succeeded: 2, retried: 0, failed: 0 });
    expect(runJobs).toHaveBeenCalledWith({ limit: 10 });
  });

  it("accepts POST too (GitHub Actions / manual trigger)", async () => {
    expect((await POST(req("Bearer s3cret-value-long-enough", "POST"))).status).toBe(200);
  });

  it("reports a failure without leaking internals", async () => {
    runJobs.mockRejectedValueOnce(new Error("claim_jobs failed: connection refused to db.internal:5432"));
    const res = await GET(req("Bearer s3cret-value-long-enough"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("db.internal");
  });
});
