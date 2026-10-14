import type { SupabaseClient, User } from "@supabase/supabase-js";

export const DEMO_READ_ONLY_ERROR =
  "This is a read-only demo workspace — create a free account to run your own RFQs.";

/**
 * Gate for every server action that writes or spends money (Gemini/Resend).
 * The demo account is also read-only at the database (migration 0008); this
 * check exists so demo visitors get a clear message instead of an RLS error,
 * and so actions that only call Gemini (smart paste, recommendations) can't
 * be used to burn quota from the shared demo session.
 */
export async function requireWritableUser(
  supabase: SupabaseClient
): Promise<{ user: User } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_demo")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile) return { error: "Could not verify your account. Try again." };
  if (profile.is_demo) return { error: DEMO_READ_ONLY_ERROR };
  return { user };
}

/** Read-only lookup for layouts/pages: is the signed-in buyer the demo account? */
export async function isDemoUser(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("is_demo").eq("id", userId).maybeSingle();
  return Boolean(data?.is_demo);
}
