import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeSupabase } from "@/test/fake-supabase";
import { poEmailContext } from "@/lib/po-email-context";

const supplier = { email: "s@supplier.example", company_name: "Gulf Trading", contact_name: null };

function db(profile: Record<string, unknown> | null, preferred: string | null) {
  return createFakeSupabase({
    profiles: profile ? [{ id: "buyer-1", ...profile }] : [],
    suppliers: [{ id: "sup-1", buyer_id: "buyer-1", email: supplier.email, preferred_language: preferred }],
  }) as unknown as SupabaseClient;
}

describe("poEmailContext", () => {
  it("uses the supplier's saved language and the buyer's VAT rate", async () => {
    expect(await poEmailContext(db({ locale: "en", vat_rate: 0.05 }, "ar"), "buyer-1", supplier)).toEqual({ language: "ar", vatRate: 0.05 });
  });

  it("falls back to the buyer's language and 15% when nothing is saved", async () => {
    expect(await poEmailContext(db({ locale: "ar", vat_rate: null }, null), "buyer-1", supplier)).toEqual({ language: "ar", vatRate: 0.15 });
    expect(await poEmailContext(db(null, null), "buyer-1", supplier)).toEqual({ language: "en", vatRate: 0.15 });
  });

  it("keeps a VAT rate of 0 (VAT turned off)", async () => {
    expect((await poEmailContext(db({ locale: "en", vat_rate: 0 }, null), "buyer-1", supplier)).vatRate).toBe(0);
  });
});
