import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let user: { id: string } | null = { id: "buyer-1" };
const loadMetricsRfqs = vi.fn(async (_s: unknown, _id: string) => [] as unknown[]);
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }));
vi.mock("@/lib/metrics/load", () => ({ loadMetricsRfqs: (s: unknown, id: string) => loadMetricsRfqs(s, id) }));

import { GET } from "@/app/api/reports/csv/route";

const req = (qs: string) => new NextRequest(`https://clarix.test/api/reports/csv${qs}`);

describe("/api/reports/csv", () => {
  it("refuses anonymous requests", async () => {
    user = null;
    expect((await GET(req(""))).status).toBe(401);
    user = { id: "buyer-1" };
  });

  it("returns a UTF-8 CSV attachment for the signed-in buyer only", async () => {
    const res = await GET(req("?section=suppliers&from=2026-01-01&to=2026-03-31"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="clarix-suppliers-2026-01-01-to-2026-03-31.csv"');
    expect(res.headers.get("cache-control")).toContain("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]); // BOM
    expect(loadMetricsRfqs).toHaveBeenCalledWith(expect.anything(), "buyer-1");
  });

  it("falls back to the awards section for an unknown one", async () => {
    const res = await GET(req("?section=../../etc"));
    expect(res.headers.get("content-disposition")).toMatch(/clarix-awards-/);
  });

  it("hides internals when loading fails", async () => {
    loadMetricsRfqs.mockRejectedValueOnce(new Error("db password=hunter2"));
    const res = await GET(req(""));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/hunter2/);
  });
});
