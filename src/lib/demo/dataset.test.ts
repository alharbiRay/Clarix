import { describe, expect, it } from "vitest";
import { DEMO_SEED, generateDemoDataset, type DemoDataset } from "@/lib/demo/dataset";
import { computeQuoteTotal, findCheapestQuote } from "@/lib/quote-comparison";
import type { Quote, QuoteItem, RfqItem } from "@/lib/types";

const NOW = new Date("2026-10-14T09:00:00Z");
const BUYER = "11111111-1111-4111-8111-111111111111";
const DAY = 86_400_000;

const data = generateDemoDataset({ seed: DEMO_SEED, now: NOW, buyerId: BUYER });

function quotesFor(d: DemoDataset, rfqId: string) {
  return d.quotes
    .filter((q) => q.rfq_id === rfqId)
    .map((q) => ({ ...q, quote_items: d.quote_items.filter((qi) => qi.quote_id === q.id) })) as unknown as (Quote & {
    quote_items: QuoteItem[];
  })[];
}
const itemsFor = (d: DemoDataset, rfqId: string) =>
  d.rfq_items.filter((i) => i.rfq_id === rfqId) as unknown as RfqItem[];

const ARABIC = /[؀-ۿ]/;
const ASCII_ONLY = /^[\x20-\x7E]+$/;

describe("generateDemoDataset", () => {
  it("is deterministic for a given seed and clock", () => {
    expect(generateDemoDataset({ seed: DEMO_SEED, now: NOW, buyerId: BUYER })).toEqual(data);
  });

  it("changes with a different seed", () => {
    const other = generateDemoDataset({ seed: "another-seed", now: NOW, buyerId: BUYER });
    expect(other.quote_items.map((q) => q.total_price)).not.toEqual(data.quote_items.map((q) => q.total_price));
  });

  it("creates 25 RFQs spread over the last six months, all owned by the demo buyer and flagged is_demo", () => {
    expect(data.rfqs).toHaveLength(25);
    for (const r of data.rfqs) {
      expect(r.buyer_id).toBe(BUYER);
      expect(r.is_demo).toBe(true);
      expect(r.currency).toBe("SAR");
      const age = NOW.getTime() - new Date(r.created_at).getTime();
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThanOrEqual(183 * DAY);
    }
    const oldest = Math.max(...data.rfqs.map((r) => NOW.getTime() - new Date(r.created_at).getTime()));
    expect(oldest).toBeGreaterThan(150 * DAY);
  });

  it("has 6-8 suppliers flagged is_demo, each with a distinct email", () => {
    expect(data.suppliers.length).toBeGreaterThanOrEqual(6);
    expect(data.suppliers.length).toBeLessThanOrEqual(8);
    expect(data.suppliers.every((s) => s.is_demo && s.buyer_id === BUYER)).toBe(true);
    expect(new Set(data.suppliers.map((s) => s.email)).size).toBe(data.suppliers.length);
  });

  it("mixes Arabic and English item names across construction, office, packaging and spare parts", () => {
    const names = data.rfq_items.map((i) => i.name);
    expect(names.some((n) => ARABIC.test(n))).toBe(true);
    expect(names.some((n) => ASCII_ONLY.test(n))).toBe(true);
    expect(new Set(data.rfqs.map((r) => r.project))).toEqual(
      new Set(["Construction supplies", "Office equipment", "Packaging", "Spare parts"])
    );
  });

  it("covers every lifecycle stage", () => {
    const stages = new Set(data.meta.stages.map((s) => s.stage));
    expect(stages).toEqual(
      new Set(["draft", "sent", "partially_replied", "compared", "needs_review", "auto_approved", "awarded"])
    );
  });

  it("keeps referential integrity", () => {
    const rfqIds = new Set(data.rfqs.map((r) => r.id));
    const itemIds = new Set(data.rfq_items.map((i) => i.id));
    const inviteIds = new Set(data.rfq_suppliers.map((s) => s.id));
    const quoteIds = new Set(data.quotes.map((q) => q.id));
    const supplierIds = new Set(data.suppliers.map((s) => s.id));
    expect(data.rfq_items.every((i) => rfqIds.has(i.rfq_id))).toBe(true);
    expect(data.rfq_suppliers.every((s) => rfqIds.has(s.rfq_id) && supplierIds.has(s.supplier_id!))).toBe(true);
    expect(data.quotes.every((q) => rfqIds.has(q.rfq_id) && inviteIds.has(q.supplier_id))).toBe(true);
    expect(data.quote_items.every((qi) => quoteIds.has(qi.quote_id) && itemIds.has(qi.rfq_item_id))).toBe(true);
    for (const qi of data.quote_items) {
      const q = data.quotes.find((x) => x.id === qi.quote_id)!;
      const item = data.rfq_items.find((i) => i.id === qi.rfq_item_id)!;
      expect(item.rfq_id).toBe(q.rfq_id);
    }
  });

  it("only submitted invites have quotes, and quotes arrive after the invitation", () => {
    for (const q of data.quotes) {
      const invite = data.rfq_suppliers.find((s) => s.id === q.supplier_id)!;
      expect(invite.status).toBe("submitted");
      expect(new Date(q.submitted_at).getTime()).toBeGreaterThan(new Date(invite.invited_at!).getTime());
      expect(new Date(q.submitted_at).getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it("auto-approved RFQs satisfy the real auto-approval rules", () => {
    const autos = data.rfq_awards.filter((a) => a.decision === "auto_approved");
    expect(autos.length).toBeGreaterThanOrEqual(5);
    for (const award of autos) {
      const cheapest = findCheapestQuote(itemsFor(data, award.rfq_id), quotesFor(data, award.rfq_id));
      expect(cheapest?.id).toBe(award.recommended_quote_id);
      expect(cheapest!.delivery_days).toBeLessThanOrEqual(14);
      expect(cheapest!.warranty).toBeTruthy();
      expect(award.po_sent_at).toBeTruthy();
      expect(data.rfqs.find((r) => r.id === award.rfq_id)!.status).toBe("awarded");
    }
  });

  it("needs-review RFQs have an award awaiting approval with a reason", () => {
    const pending = data.rfq_awards.filter((a) => a.decision !== "auto_approved" && !a.po_sent_at);
    expect(pending.length).toBeGreaterThanOrEqual(3);
    expect(pending.every((a) => a.reason && a.reason.length > 10)).toBe(true);
    expect(pending.some((a) => a.decision === "differs_from_cheapest")).toBe(true);
  });

  it("review_needed / differs_from_cheapest decisions are what the real rules engine would conclude", () => {
    for (const award of data.rfq_awards.filter((a) => a.decision !== "auto_approved")) {
      const quotes = quotesFor(data, award.rfq_id);
      const cheapest = findCheapestQuote(itemsFor(data, award.rfq_id), quotes)!;
      expect(cheapest.id).toBe(award.cheapest_quote_id);
      if (award.decision === "review_needed") {
        expect(award.recommended_quote_id).toBe(cheapest.id);
        expect(cheapest.delivery_days! > 14 || !cheapest.warranty).toBe(true);
      } else {
        expect(award.recommended_quote_id).not.toBe(cheapest.id);
      }
    }
  });

  it("stores a believable AI recommendation that names a supplier who actually quoted", () => {
    expect(data.ai_recommendations.length).toBeGreaterThanOrEqual(10);
    for (const rec of data.ai_recommendations) {
      const labels = quotesFor(data, rec.rfq_id).map(
        (q) => data.rfq_suppliers.find((s) => s.id === q.supplier_id)!.company_name
      );
      const top = rec.content.ranking.find((r) => r.rank === 1)!;
      expect(labels).toContain(top.supplier);
      expect(rec.content.reasoning).toMatch(/SAR/);
      expect(rec.content.ranking).toHaveLength(labels.length);
    }
  });

  it("varies prices over time so price history is meaningful", () => {
    const byName = new Map<string, { t: number; unit: number }[]>();
    for (const qi of data.quote_items) {
      const item = data.rfq_items.find((i) => i.id === qi.rfq_item_id)!;
      const q = data.quotes.find((x) => x.id === qi.quote_id)!;
      if (qi.unit_price === null) continue;
      const list = byName.get(item.name) ?? [];
      list.push({ t: new Date(q.submitted_at).getTime(), unit: qi.unit_price });
      byName.set(item.name, list);
    }
    const repeated = Array.from(byName.values()).filter((l) => l.length >= 4);
    expect(repeated.length).toBeGreaterThanOrEqual(5);
    const spreads = repeated.map((l) => Math.max(...l.map((p) => p.unit)) / Math.min(...l.map((p) => p.unit)));
    expect(spreads.some((s) => s > 1.08)).toBe(true);
  });

  it("totals match unit price × quantity", () => {
    for (const qi of data.quote_items) {
      if (qi.unit_price === null) {
        expect(qi.total_price).toBeNull();
        continue;
      }
      const item = data.rfq_items.find((i) => i.id === qi.rfq_item_id)!;
      expect(qi.total_price).toBeCloseTo(qi.unit_price * item.quantity, 1);
    }
    for (const a of data.rfq_awards) {
      if (!a.recommended_quote_id) continue;
      const q = quotesFor(data, a.rfq_id).find((x) => x.id === a.recommended_quote_id)!;
      expect(computeQuoteTotal(itemsFor(data, a.rfq_id), q).total).toBeGreaterThan(0);
    }
  });
});
