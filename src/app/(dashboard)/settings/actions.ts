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
