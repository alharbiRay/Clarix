import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

let db: FakeSupabase;
vi.mock("@/lib/supabase/server", () => ({ createClient: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updatePriceAlertThreshold } from "@/app/(dashboard)/settings/actions";

function signIn(isDemo = false) {
  db = Object.assign(createFakeSupabase({ profiles: [{ id: "u1", is_demo: isDemo, price_alert_threshold: 0.1 }] }), {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
  });
}

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
