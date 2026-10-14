import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
import { buildJobHooks } from "@/lib/jobs/run";
import type { Job } from "@/lib/jobs/processor";

const job = (overrides: Partial<Job> = {}): Job => ({
  id: "job-1",
  type: "auto_recommendation",
  buyer_id: "buyer-1",
  rfq_id: "rfq-1",
  payload: {},
  attempts: 1,
  max_attempts: 5,
  ...overrides,
});

function db() {
  return createFakeSupabase({ rfqs: [{ id: "rfq-1", title: "Office chairs" }], notifications: [], audit_events: [] });
}

describe("job hooks", () => {
  it("tells the buyer once, on the first quota failure, that the recommendation will retry automatically", async () => {
    const fake = db();
    const hooks = buildJobHooks(fake as never);
    await hooks.onRetry!(job({ attempts: 1 }), new Error("429"), "quota");
    await hooks.onRetry!(job({ attempts: 2 }), new Error("429"), "quota");
    expect(fake.tables.notifications).toEqual([
      expect.objectContaining({
        buyer_id: "buyer-1",
        rfq_id: "rfq-1",
        type: "ai_delayed",
        message: expect.stringMatching(/Office chairs.*quota.*retry automatically/i),
      }),
    ]);
    expect(fake.tables.audit_events).toEqual([
      expect.objectContaining({ event_type: "ai_quota_error", rfq_id: "rfq-1", actor_type: "system" }),
    ]);
  });

  it("stays quiet on transient retries", async () => {
    const fake = db();
    await buildJobHooks(fake as never).onRetry!(job(), new Error("socket"), "transient");
    expect(fake.tables.notifications).toHaveLength(0);
  });

  it("tells the buyer to act manually when the recommendation job gives up", async () => {
    const fake = db();
    await buildJobHooks(fake as never).onGiveUp!(job({ attempts: 5 }), new Error("x"));
    expect(fake.tables.notifications[0]).toMatchObject({
      type: "action_required",
      message: expect.stringMatching(/Office chairs.*generate it manually/i),
    });
    expect(fake.tables.audit_events).toEqual([expect.objectContaining({ event_type: "job_failed", payload: expect.objectContaining({ jobType: "auto_recommendation" }) })]);
  });

  it("explains a failed emailed quote and asks for a resend or manual entry", async () => {
    const fake = db();
    await buildJobHooks(fake as never).onGiveUp!(job({ type: "inbound_email_quote" }), new Error("unreadable"));
    expect(fake.tables.notifications[0]).toMatchObject({
      type: "action_required",
      message: expect.stringMatching(/emailed quote for Office chairs couldn't be processed.*resend.*manually/i),
    });
  });

  it("ignores jobs that are not tied to a buyer", async () => {
    const fake = db();
    await buildJobHooks(fake as never).onGiveUp!(job({ buyer_id: null }), new Error("x"));
    expect(fake.tables.notifications).toHaveLength(0);
  });
});
