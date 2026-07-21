"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Toggles the buyer's auto-approval setting (src/lib/auto-approval.ts gates on this). */
export async function updateAutoApprovalSetting(enabled: boolean) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({ auto_approval_enabled: enabled })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: true };
}
