import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

let db: FakeSupabase;
vi.mock("@/lib/supabase/server", () => ({ createClient: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveApprovalPolicy, updateAutoApprovalSetting, updatePriceAlertThreshold } from "@/app/(dashboard)/settings/actions";
import { DEFAULT_POLICY } from "@/lib/approval/rules";

function signIn(isDemo = false) {
  db = Object.assign(createFakeSupabase({ profiles: [{ id: "u1", is_demo: isDemo, price_alert_threshold: 0.1, role: "manager" }] }), {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
  });
}

describe("saveApprovalPolicy", () => {
  beforeEach(() => signIn());

  it("stores a validated policy for the signed-in account", async () => {
    const policy = { ...DEFAULT_POLICY, maxDeliveryDays: 21, spendLimit: 50_000, spendLimitCurrency: "SAR", minSupplierScore: 60 };
    expect(await saveApprovalPolicy(policy)).toEqual({ success: true, policy });
    expect(db.tables.approval_policies).toEqual([
      expect.objectContaining({ buyer_id: "u1", max_delivery_days: 21, spend_limit: 50_000, spend_limit_currency: "SAR", min_supplier_score: 60, require_cheapest: true }),
    ]);
  });

  it("updates the existing row instead of adding another", async () => {
    await saveApprovalPolicy(DEFAULT_POLICY);
    await saveApprovalPolicy({ ...DEFAULT_POLICY, requireWarranty: false });
    expect(db.tables.approval_policies).toHaveLength(1);
    expect(db.tables.approval_policies[0].require_warranty).toBe(false);
  });

  it("rejects an invalid policy without writing", async () => {
    expect(await saveApprovalPolicy({ ...DEFAULT_POLICY, maxDeliveryDays: 0 })).toEqual({ error: "Max delivery days must be at least 1" });
    expect(db.tables.approval_policies ?? []).toHaveLength(0);
  });

  it("the on/off switch keeps the rest of the policy and mirrors the old profile flag", async () => {
    await saveApprovalPolicy({ ...DEFAULT_POLICY, spendLimit: 1_000, spendLimitCurrency: "SAR" });
    expect(await updateAutoApprovalSetting(false)).toEqual({ success: true });
    expect(db.tables.approval_policies[0]).toMatchObject({ enabled: false, spend_limit: 1_000 });
    expect(db.tables.profiles[0].auto_approval_enabled).toBe(false);
  });

  it("is refused in the demo workspace", async () => {
    signIn(true);
    expect((await saveApprovalPolicy(DEFAULT_POLICY)).error).toMatch(/read-only demo/);
  });

  it("a partial payload is rejected instead of resetting the other fields", async () => {
    await saveApprovalPolicy({ ...DEFAULT_POLICY, spendLimit: 1_000, spendLimitCurrency: "SAR" });
    expect((await saveApprovalPolicy({})).error).toBeTruthy();
    expect((await saveApprovalPolicy({ enabled: false })).error).toBeTruthy();
    expect(db.tables.approval_policies[0]).toMatchObject({ spend_limit: 1_000, enabled: true });
  });

  it("only a manager can change the rules", async () => {
    db.tables.profiles[0].role = "buyer";
    expect(await saveApprovalPolicy(DEFAULT_POLICY)).toEqual({ error: "Only a manager can change the approval rules." });
    expect(db.tables.approval_policies ?? []).toHaveLength(0);
  });
});

describe("updatePriceAlertThreshold", () => {
  beforeEach(() => signIn());

  it("stores a whole-number percentage as a fraction", async () => {
    expect(await updatePriceAlertThreshold(15)).toEqual({ success: true });
    expect(db.tables.profiles[0].price_alert_threshold).toBe(0.15);
  });

  it.each([0, 101, 2.5, Number.NaN])("rejects %s", async (pct) => {
    expect(await updatePriceAlertThreshold(pct)).toEqual({ error: "Enter a whole number from 1 to 100." });
    expect(db.tables.profiles[0].price_alert_threshold).toBe(0.1);
  });

  it("is refused in the demo workspace", async () => {
    signIn(true);
    expect((await updatePriceAlertThreshold(20)).error).toMatch(/read-only demo/);
  });
});
