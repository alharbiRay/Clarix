"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_DEMO_EMAIL, openDemoSession } from "@/lib/demo/session";

/** "Try the demo" — POST-only (a form action), so prefetchers and crawlers can't open sessions. */
export async function startDemoSession() {
  const admin = createAdminClient();
  const supabase = createClient();
  const email = process.env.DEMO_ACCOUNT_EMAIL || DEFAULT_DEMO_EMAIL;

  const result = await openDemoSession({
    admin,
    email,
    async generateTokenHash(target) {
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: target });
      if (error || !data.properties?.hashed_token) throw new Error(error?.message ?? "no token returned");
      return data.properties.hashed_token;
    },
    async verifyTokenHash(tokenHash) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      return { ok: !error };
    },
  });

  if (!result.ok) redirect("/login?reason=demo_unavailable");
  redirect("/dashboard");
}

/** Leaves the demo and lands on the sign-up tab. */
export async function exitDemoToSignup() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login?tab=signup");
}
