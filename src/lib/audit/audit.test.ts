import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
import { describeAuditEvent, recordAuditEvent, type AuditEventInput } from "@/lib/audit";

const base = { buyerId: "b1", rfqId: "r1" } as const;

describe("describeAuditEvent", () => {
  it("explains an auto-approval in plain language", () => {
    const d = describeAuditEvent({
      event_type: "auto_approval_decided",
      payload: {
        decision: "auto_approved",
        supplier: "Al Rashid Building Materials",
        explanation: ["cheapest complete quote", "delivery 9 days", "12 months warranty"],
      },
    });
    expect(d).toMatchObject({ tone: "positive", title: "Auto-approved: Al Rashid Building Materials" });
    expect(d.detail).toBe("Cheapest complete quote, delivery 9 days, 12 months warranty.");
  });

  it("explains a hold for review with the reason", () => {
    const d = describeAuditEvent({
      event_type: "auto_approval_decided",
      payload: { decision: "review_needed", reason: "cheapest option has issues — no warranty provided" },
    });
    expect(d).toMatchObject({ tone: "warning", title: "Held for your review" });
    expect(d.detail).toBe("Cheapest option has issues — no warranty provided.");
  });

  it("names an override and its reason", () => {
    const d = describeAuditEvent({
      event_type: "award_approved",
      payload: { supplier: "Gulf Office Supplies", override: true, aiPick: "Red Sea Packaging Co.", reason: "Needs a 2-year warranty" },
    });
    expect(d.title).toBe("Approved Gulf Office Supplies instead of the AI's pick (Red Sea Packaging Co.)");
    expect(d.detail).toBe("Reason: Needs a 2-year warranty.");
  });

  it("says how a quote arrived and what the AI read from a PDF", () => {
    expect(describeAuditEvent({ event_type: "quote_received", payload: { supplier: "Najd", source: "email", total: 1234.5, currency: "SAR" } })).toMatchObject({
      title: "Quote received from Najd by email (PDF)",
      detail: "SAR 1,234.50 in total.",
    });
    expect(
      describeAuditEvent({ event_type: "extraction_completed", payload: { supplier: "Najd", confidence: "medium", warnings: ["Currency is USD"] } })
    ).toMatchObject({ title: "AI read Najd's PDF (medium confidence)", detail: "Check: Currency is USD.", tone: "warning" });
  });

  it("flags a PO whose email failed, and explains a skipped auto-approval", () => {
    expect(
      describeAuditEvent({ event_type: "po_sent", payload: { supplier: "Najd", total: 10, currency: "SAR", emailDelivered: false } })
    ).toMatchObject({ title: "Purchase order approved, but the email to Najd failed", tone: "warning" });
    expect(
      describeAuditEvent({ event_type: "auto_approval_decided", payload: { decision: "not_evaluated", reason: "no quote has a price for every line item yet" } })
    ).toMatchObject({ title: "Auto-approval skipped", detail: "No quote has a price for every line item yet." });
  });

  it("describes a negotiation without repeating the message", () => {
    expect(
      describeAuditEvent({ event_type: "negotiation_sent", payload: { supplier: "Najd", targetPercent: 5, language: "ar", subject: "x" } })
    ).toMatchObject({ title: "Negotiation message sent to Najd", detail: "Asked for about 5% off in Arabic." });
  });

  it("falls back gracefully for unexpected payloads", () => {
    expect(describeAuditEvent({ event_type: "po_sent", payload: {} }).title).toBe("Purchase order sent");
    expect(describeAuditEvent({ event_type: "something_new", payload: null }).title).toBe("Something new");
  });
});

describe("recordAuditEvent", () => {
  const event: AuditEventInput = {
    ...base,
    actor: { type: "system" },
    type: "rfq_sent",
    summary: "Sent to 3 suppliers",
    payload: { invited: 3 },
  };

  it("writes one row with the actor and payload", async () => {
    const db = createFakeSupabase({ audit_events: [] });
    await recordAuditEvent(event, db as never);
    expect(db.tables.audit_events).toEqual([
      expect.objectContaining({ buyer_id: "b1", rfq_id: "r1", actor_type: "system", actor_id: null, event_type: "rfq_sent", summary: "Sent to 3 suppliers", payload: { invited: 3 } }),
    ]);
  });

  it("never throws — a failed audit write must not break the business flow", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { from: () => ({ insert: async () => ({ error: { message: "boom" } }) }) };
    await expect(recordAuditEvent(event, broken as never)).resolves.toBe(false);
    const exploding = { from: () => { throw new Error("no client"); } };
    await expect(recordAuditEvent(event, exploding as never)).resolves.toBe(false);
    expect(error).toHaveBeenCalled();
  });
});
