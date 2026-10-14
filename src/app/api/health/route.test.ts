import { describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns ok with an ISO timestamp and is never cached", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abcdef1234567");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    expect(body.version).toBe("abcdef1");
  });

  it("does not leak configuration or secrets", async () => {
    const body = JSON.stringify(await (await GET()).json());
    expect(body).not.toMatch(/key|secret|supabase/i);
  });
});
