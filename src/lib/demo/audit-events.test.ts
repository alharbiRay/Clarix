import { describe, expect, it } from "vitest";
import { DEMO_SEED, generateDemoDataset } from "@/lib/demo/dataset";
import { describeAuditEvent } from "@/lib/audit";

const NOW = new Date("2026-10-14T09:00:00Z");
const data = generateDemoDataset({ seed: DEMO_SEED, now: NOW, buyerId: "b" });

describe("demo audit trail", () => {
  it("gives every RFQ a history that starts with its creation", () => {
    for (const r of data.rfqs) {
      const events = data.audit_events.filter((e) => e.rfq_id === r.id);
      expect(events[0]).toMatchObject({ event_type: "rfq_created", created_at: r.created_at });
    }
  });

  it("is chronological per RFQ and owned by the demo buyer", () => {
    for (const r of data.rfqs) {
      const times = data.audit_events.filter((e) => e.rfq_id === r.id).map((e) => e.created_at);
      expect([...times].sort()).toEqual(times);
    }
    expect(data.audit_events.every((e) => e.buyer_id === "b")).toBe(true);
  });

  it("records each quote, AI read and decision", () => {
    expect(data.audit_events.filter((e) => e.event_type === "quote_received")).toHaveLength(data.quotes.length);
    expect(data.audit_events.filter((e) => e.event_type === "extraction_completed")).toHaveLength(
      data.quotes.filter((q) => q.source === "email").length
    );
    expect(data.audit_events.filter((e) => e.event_type === "auto_approval_decided")).toHaveLength(data.rfq_awards.length);
    expect(data.audit_events.filter((e) => e.event_type === "po_sent")).toHaveLength(data.rfq_awards.filter((a) => a.po_sent_at).length);
  });

  it("explains auto-approvals in plain language", () => {
    const auto = data.audit_events.find((e) => e.event_type === "auto_approval_decided" && e.payload.decision === "auto_approved")!;
    expect(describeAuditEvent(auto).detail).toMatch(/^Cheapest complete quote, delivery \d+ days \(limit 14\), .+ warranty\.$/);
  });

  it("is deterministic", () => {
    expect(generateDemoDataset({ seed: DEMO_SEED, now: NOW, buyerId: "b" }).audit_events).toEqual(data.audit_events);
  });
});
