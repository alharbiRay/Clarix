import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

let db: FakeSupabase;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
vi.mock("next/headers", () => ({ headers: () => new Headers({ "x-forwarded-for": "198.51.100.4" }) }));

import { joinWaitlist } from "@/app/(marketing)/pricing/actions";

const valid = { name: "Sara Al-Qahtani", email: "Sara@Company.sa", company: "Al Waha", teamSize: "11-50" as const, tier: "team" as const, note: "" };

beforeEach(() => {
  db = createFakeSupabase({ leads: [] });
  db.rpcHandlers.consume_public_rate_limit = () => true;
});

describe("joinWaitlist", () => {
  it("stores a valid lead with a normalised email and the page language", async () => {
    expect(await joinWaitlist(valid, "ar")).toEqual({ success: true });
    expect(db.tables.leads).toEqual([
      expect.objectContaining({ name: "Sara Al-Qahtani", email: "sara@company.sa", company: "Al Waha", team_size: "11-50", tier: "team", note: null, locale: "ar" }),
    ]);
  });

  it("names the field that's wrong, in the visitor's language", async () => {
    expect(await joinWaitlist({ ...valid, email: "nope" }, "en")).toMatchObject({ field: "email", error: "Enter a valid email address." });
    expect(await joinWaitlist({ ...valid, name: "  " }, "ar")).toMatchObject({ field: "name", error: "أدخل اسمك." });
    expect(db.tables.leads).toEqual([]);
  });

  it("refuses when this connection is over the limit, keyed by a hash", async () => {
    const calls: Record<string, unknown>[] = [];
    db.rpcHandlers.consume_public_rate_limit = (args) => {
      calls.push(args);
      return false;
    };
    expect(await joinWaitlist(valid, "en")).toMatchObject({ error: expect.stringMatching(/Too many attempts/) });
    expect(db.tables.leads).toEqual([]);
    expect(calls[0]).toMatchObject({ p_action: "lead_submit_ip", p_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("treats a repeat sign-up as done and never logs personal data", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Simulate the unique-email violation the database raises.
    const original = db.from.bind(db);
    db.from = ((table: string) => {
      const q = original(table);
      if (table === "leads") q.insert = (() => Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key sara@company.sa" } })) as never;
      return q;
    }) as never;
    expect(await joinWaitlist(valid, "en")).toEqual({ success: true });

    db.from = ((table: string) => {
      const q = original(table);
      if (table === "leads") q.insert = (() => Promise.resolve({ data: null, error: { code: "XX000", message: "boom for sara@company.sa" } })) as never;
      return q;
    }) as never;
    expect(await joinWaitlist(valid, "en")).toMatchObject({ error: expect.stringMatching(/didn't go through/) });
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/sara|Sara/);
  });
});
