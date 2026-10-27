"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWritableUser } from "@/lib/auth/session";

/** Toggles the buyer's auto-approval setting (src/lib/auto-approval.ts gates on this). */
export async function updateAutoApprovalSetting(enabled: boolean) {
  const supabase = createClient();
  const auth = await requireWritableUser(supabase);
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;

  const { error } = await supabase
    .from("profiles")
    .update({ auto_approval_enabled: enabled })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: true };
}

/**
 * Sets the buyer's price alert threshold (comparison-page badges flag changes
 * at or above it). Takes a whole-number percentage; stored as a fraction.
 */
export async function updatePriceAlertThreshold(percent: number) {
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    return { error: "Enter a whole number from 1 to 100." };
  }
  const supabase = createClient();
  const auth = await requireWritableUser(supabase);
  if ("error" in auth) return { error: auth.error };

  const { error } = await supabase
    .from("profiles")
    .update({ price_alert_threshold: percent / 100 })
    .eq("id", auth.user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: true };
}
