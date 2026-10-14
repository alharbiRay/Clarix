import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_DEMO_EMAIL = "demo@clarix.example";

export interface DemoSessionDeps {
  /** Service-role client, used only to confirm the target account is the flagged demo account. */
  admin: SupabaseClient;
  email: string;
  /** Mints a one-time magic-link token hash (no email is sent). */
  generateTokenHash(email: string): Promise<string>;
  /** Exchanges the hash for a session on the visitor's cookie-bound client. */
  verifyTokenHash(tokenHash: string): Promise<{ ok: boolean }>;
}

export type DemoSessionResult = { ok: true } | { ok: false; reason: "not_configured" | "failed" };

/**
 * Signs the visitor into the shared demo workspace without a password ever
 * existing: the server mints a one-time magic-link token for the demo account
 * and immediately verifies it into the visitor's cookies. Refuses unless the
 * target profile is flagged is_demo, so a misconfigured DEMO_ACCOUNT_EMAIL can
 * never hand out a real buyer's session.
 */
export async function openDemoSession(deps: DemoSessionDeps): Promise<DemoSessionResult> {
  const { data: profile } = await deps.admin
    .from("profiles")
    .select("id, is_demo")
    .eq("email", deps.email)
    .maybeSingle();
  if (!profile?.is_demo) return { ok: false, reason: "not_configured" };

  try {
    const hash = await deps.generateTokenHash(deps.email);
    const verified = await deps.verifyTokenHash(hash);
    return verified.ok ? { ok: true } : { ok: false, reason: "failed" };
  } catch (e) {
    console.error(JSON.stringify({ event: "demo.session_failed", error: e instanceof Error ? e.message : String(e) }));
    return { ok: false, reason: "failed" };
  }
}
