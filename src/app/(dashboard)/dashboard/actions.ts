"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWritableUser } from "@/lib/auth/session";

/** Dismisses a dashboard notification (e.g. the "comparison ready" banner). */
export async function markNotificationRead(notificationId: string) {
  const supabase = createClient();
  const auth = await requireWritableUser(supabase);
  if ("error" in auth) return { error: auth.error };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}
