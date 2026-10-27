import { describe, expect, it } from "vitest";
import { loadMetricsRfqs, METRICS_PAGE_SIZE, toMetricsRfq } from "@/lib/metrics/load";
import { createFakeSupabase } from "@/test/fake-supabase";

const row = {
  id: "r1",
  title: "Cement",
  currency: "SAR",
  created_at: "2026-10-01T00:00:00Z",
  rfq_items: [{ id: "i1", name: "Cement", quantity: "10.000" }],
  rfq_suppliers: [
    { id: "s1", company_name: null, email: "a@x.example", supplier_id: "sup1", status: "submitted", invited_at: "2026-10-01T01:00:00Z" },
  ],
  quotes: [
    { id: "q1", supplier_id: "s1", status: "submitted", submitted_at: "2026-10-02T00:00:00Z", quote_items: [{ rfq_item_id: "i1", total_price: "125.50" }] },
  ],
};

describe("toMetricsRfq", () => {
  it("normalizes a PostgREST row, coercing numeric strings and labelling suppliers", () => {
    const m = toMetricsRfq({ ...row, rfq_awards: null });
    expect(m.items).toEqual([{ id: "i1", name: "Cement", quantity: 10 }]);
    expect(m.invites[0]).toMatchObject({ id: "s1", label: "a@x.example", supplier_id: "sup1" });
    expect(m.quotes[0].lines).toEqual([{ item_id: "i1", total: 125.5 }]);
    expect(m.award).toBeNull();
  });

  it("accepts the award embedded as an object or as a one-element array", () => {
    const award = { decision: "auto_approved" as const, recommended_quote_id: "q1", po_sent_at: "2026-10-03T00:00:00Z", created_at: "2026-10-03T00:00:00Z", reason: null };
    expect(toMetricsRfq({ ...row, rfq_awards: award }).award).toMatchObject({ quote_id: "q1", decision: "auto_approved" });
    expect(toMetricsRfq({ ...row, rfq_awards: [award] }).award).toMatchObject({ quote_id: "q1" });
    expect(toMetricsRfq({ ...row, rfq_awards: [] }).award).toBeNull();
  });
});

describe("loadMetricsRfqs", () => {
  it("pages past PostgREST's row limit instead of silently truncating", async () => {
    const total = METRICS_PAGE_SIZE * 2 + 5;
    const rows = Array.from({ length: total }, (_, i) => ({
      ...row,
      id: `r${i}`,
      buyer_id: "b",
      created_at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
      rfq_awards: null,
    }));
    const db = createFakeSupabase({ rfqs: rows }, { rfqs: { maxRows: METRICS_PAGE_SIZE } });
    expect(await loadMetricsRfqs(db as never, "b")).toHaveLength(total);
  });
});
