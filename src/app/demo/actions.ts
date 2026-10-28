"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { clientIp, consumePublicRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_DEMO_EMAIL, openDemoSession } from "@/lib/demo/session";

/** "Try the demo" — POST-only (a form action), so prefetchers and crawlers can't open sessions. */
export async function startDemoSession() {
  const admin = createAdminClient();
  const supabase = createClient();
  const email = process.env.DEMO_ACCOUNT_EMAIL || DEFAULT_DEMO_EMAIL;

  // Each session mints a magic link: cap how many one visitor can open.
  if (!(await consumePublicRateLimit(admin, "demo_start_ip", clientIp(headers())))) {
    redirect("/login?reason=demo_busy");
  }

  const result = await openDemoSession({
    admin,
    email,
    async generateTokenHash(target) {
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: target });
      if (error || !data.properties?.hashed_token || !data.user) {
        throw new Error(error?.message ?? "no token returned");
      }
      return { tokenHash: data.properties.hashed_token, userId: data.user.id };
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
  // "local": end only THIS visitor's session. The default (global) would
  // revoke every refresh token of the shared demo account and log out every
  // other visitor at their next refresh.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?tab=signup");
}
