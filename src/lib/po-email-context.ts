import type { SupabaseClient } from "@supabase/supabase-js";
import { supplierLanguage } from "@/i18n/translator";
import type { Locale } from "@/i18n/config";

/**
 * What a purchase-order email needs beyond the quote: the supplier's language
 * and the buyer's VAT rate. Best-effort — on any read error it falls back to
 * English and 15% (the email still goes out).
 */
export async function poEmailContext(
  supabase: SupabaseClient,
  buyerId: string,
  supplier: { email: string; company_name: string | null; contact_name?: string | null }
): Promise<{ language: Locale; vatRate: number }> {
  try {
    const [{ data: buyer }, { data: profile }] = await Promise.all([
      supabase.from("profiles").select("locale, vat_rate").eq("id", buyerId).maybeSingle(),
      supabase.from("suppliers").select("preferred_language").eq("buyer_id", buyerId).eq("email", supplier.email).maybeSingle(),
    ]);
    return {
      language: supplierLanguage({
        preferred: profile?.preferred_language,
        companyName: supplier.company_name,
        contactName: supplier.contact_name ?? null,
        buyerLocale: buyer?.locale,
      }),
      vatRate: buyer?.vat_rate === undefined || buyer?.vat_rate === null ? 0.15 : Number(buyer.vat_rate),
    };
  } catch (e) {
    console.error("[po-email] context unavailable:", e);
    return { language: "en", vatRate: 0.15 };
  }
}
