"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, consumePublicRateLimit } from "@/lib/rate-limit";
import { leadSchema, type LeadInput } from "@/lib/validations/lead";
import { isLocale } from "@/i18n/config";
import { translatorFor } from "@/i18n/translator";

/**
 * Pricing-page waitlist. Public: validated, rate limited per IP (0020), and
 * written with the service role because nobody can read or write `leads`
 * through the API. Personal data never reaches the logs — only error codes.
 * A repeat sign-up with the same email counts as done.
 */
export async function joinWaitlist(input: LeadInput, language?: string) {
  const locale = isLocale(language) ? language : "en";
  const te = translatorFor(locale, "pricing.waitlist.errors");

  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { error: field === "email" ? te("email") : field === "name" ? te("name") : te("failed"), field: String(field ?? "") };
  }

  const admin = createAdminClient();
  if (!(await consumePublicRateLimit(admin, "lead_submit_ip", clientIp(headers())))) {
    return { error: te("tooMany") };
  }

  const v = parsed.data;
  const { error } = await admin.from("leads").insert({
    name: v.name,
    email: v.email,
    company: v.company,
    team_size: v.teamSize ?? null,
    tier: v.tier ?? null,
    note: v.note,
    locale,
  });
  if (error && error.code !== "23505") {
    console.error("[waitlist] insert failed:", error.code);
    return { error: te("failed") };
  }
  return { success: true as const };
}
