import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

const verify = vi.fn();
vi.mock("@/lib/resend", () => ({ getResendClient: () => ({ webhooks: { verify } }) }));

let db: FakeSupabase;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));

const scheduleJob = vi.fn(async (_input: unknown): Promise<string | null> => "job-123");
vi.mock("@/lib/jobs/schedule", () => ({ scheduleJob: (input: unknown) => scheduleJob(input) }));

import { POST } from "@/app/api/webhooks/resend-inbound/route";

function post(body: unknown) {
  return POST(
    new NextRequest("https://clarix.test/api/webhooks/resend-inbound", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "svix-id": "id", "svix-timestamp": "1", "svix-signature": "sig" },
    })
  );
}

const received = (to: string[]) => ({ type: "email.received", data: { email_id: "email-1", to } });

describe("POST /api/webhooks/resend-inbound", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_test");
    verify.mockReset();
    scheduleJob.mockClear();
    db = createFakeSupabase({
      rfq_suppliers: [{ id: "rs-1", rfq_id: "rfq-1", token: "abc123", rfqs: { buyer_id: "buyer-1" } }],
    });
  });

  it("rejects requests whose svix signature does not verify", async () => {
    verify.mockImplementation(() => {
      throw new Error("bad signature");
    });
    expect((await post({})).status).toBe(401);
    expect(scheduleJob).not.toHaveBeenCalled();
  });

  it("rejects everything when the webhook secret is not configured", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    verify.mockImplementation((args: { payload: string }) => JSON.parse(args.payload));
    expect((await post(received(["quotes+abc123@in.clarix.test"]))).status).toBe(401);
  });

  it("acknowledges unrelated event types", async () => {
    verify.mockReturnValue({ type: "email.sent", data: {} });
    expect((await post({})).status).toBe(200);
    expect(scheduleJob).not.toHaveBeenCalled();
  });

  it("acknowledges mail that is not addressed to a quote token, or to an unknown token", async () => {
    verify.mockReturnValueOnce(received(["hello@in.clarix.test"]));
    expect((await post({})).status).toBe(200);
    verify.mockReturnValueOnce(received(["quotes+ffff@in.clarix.test"]));
    expect((await post({})).status).toBe(200);
    expect(scheduleJob).not.toHaveBeenCalled();
  });

  it("enqueues a durable extraction job and answers immediately", async () => {
    verify.mockReturnValue(received(["Quotes+ABC123@in.clarix.test"]));
    const res = await post({});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, jobId: "job-123" });
    expect(scheduleJob).toHaveBeenCalledWith({
      type: "inbound_email_quote",
      buyerId: "buyer-1",
      rfqId: "rfq-1",
      payload: { emailId: "email-1", rfqSupplierId: "rs-1" },
      dedupeKey: "inbound_email:email-1",
      maxAttempts: 3,
    });
  });

  it("returns 500 when the job cannot be recorded, so Resend retries the webhook", async () => {
    verify.mockReturnValue(received(["quotes+abc123@in.clarix.test"]));
    scheduleJob.mockResolvedValueOnce(null);
    expect((await post({})).status).toBe(500);
  });
});
