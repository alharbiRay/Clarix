import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_DEMO_EMAIL = "demo@clarix.example";
const MAX_ATTEMPTS = 3;

export interface DemoSessionDeps {
  /** Service-role client, used only to confirm the target account is the flagged demo account. */
  admin: SupabaseClient;
  email: string;
  /** Mints a one-time magic-link token hash (no email is sent) and reports which auth user it belongs to. */
  generateTokenHash(email: string): Promise<{ tokenHash: string; userId: string }>;
  /** Exchanges the hash for a session on the visitor's cookie-bound client. */
  verifyTokenHash(tokenHash: string): Promise<{ ok: boolean }>;
}

export type DemoSessionResult = { ok: true } | { ok: false; reason: "not_configured" | "failed" };

/**
 * Signs the visitor into the shared demo workspace without a password ever
 * existing: the server mints a one-time magic-link token for the demo account
 * and immediately verifies it into the visitor's cookies.
 *
 * Identity is pinned twice: the profile must be flagged is_demo (looked up by
 * email AND flag, so another profile claiming the same email can neither
 * break nor hijack it), and the auth user the token was minted for must be
 * that same profile.
 *
 * GoTrue keeps one magic-link token per user, so two visitors clicking at the
 * same moment can supersede each other's token — hence a short retry.
 */
export async function openDemoSession(deps: DemoSessionDeps): Promise<DemoSessionResult> {
  const { data: profile } = await deps.admin
    .from("profiles")
    .select("id")
    .eq("email", deps.email)
    .eq("is_demo", true)
    .maybeSingle();
  if (!profile) return { ok: false, reason: "not_configured" };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { tokenHash, userId } = await deps.generateTokenHash(deps.email);
      if (userId !== profile.id) {
        console.error(JSON.stringify({ event: "demo.identity_mismatch" }));
        return { ok: false, reason: "failed" };
      }
      const verified = await deps.verifyTokenHash(tokenHash);
      if (verified.ok) return { ok: true };
    } catch (e) {
      console.error(
        JSON.stringify({ event: "demo.session_attempt_failed", attempt, error: e instanceof Error ? e.message : String(e) })
      );
    }
  }
  return { ok: false, reason: "failed" };
}
