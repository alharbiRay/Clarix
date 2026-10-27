"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWritableUser } from "@/lib/auth/session";
import { parsePolicy } from "@/lib/approval/rules";
import { loadApprovalPolicy, policyToRow } from "@/lib/approval/policy";

/**
 * Saves the account's approval policy (migration 0013) — the rules
 * src/lib/auto-approval.ts applies. Validated here, not just in the form.
 * profiles.auto_approval_enabled is kept in step for older code paths.
 */
export async function saveApprovalPolicy(input: unknown) {
  // Strict: every field required, so a partial payload can't reset the rest.
  const parsed = parsePolicy(input, { strict: true });
  if (!parsed.ok) return { error: parsed.error };
  const supabase = createClient();
  const auth = await requireWritableUser(supabase);
  if ("error" in auth) return { error: auth.error };
  // Also enforced by RLS (migration 0014); checked here for a clear message.
  const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (me?.role !== "manager") return { error: "Only a manager can change the approval rules." };

  const { error } = await supabase
    .from("approval_policies")
    .upsert(policyToRow(auth.user.id, parsed.policy), { onConflict: "buyer_id" });
  if (error) return { error: "Couldn't save the approval rules. Try again." };
  await supabase.from("profiles").update({ auto_approval_enabled: parsed.policy.enabled }).eq("id", auth.user.id);

  revalidatePath("/settings");
  return { success: true as const, policy: parsed.policy };
}

/** Turns auto-approval on or off, keeping the rest of the policy as it is. */
export async function updateAutoApprovalSetting(enabled: boolean) {
  const supabase = createClient();
  const auth = await requireWritableUser(supabase);
  if ("error" in auth) return { error: auth.error };
  let current;
  try {
    current = await loadApprovalPolicy(supabase, auth.user.id);
  } catch {
    return { error: "Couldn't load the approval rules. Try again." };
  }
  const result = await saveApprovalPolicy({ ...current, enabled });
  return "error" in result ? { error: result.error } : { success: true };
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
