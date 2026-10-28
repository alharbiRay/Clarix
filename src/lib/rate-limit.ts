import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicRateLimitAction = "quote_submit_token" | "quote_submit_ip" | "demo_start_ip";

/** Opaque per-action key: raw tokens and IPs never reach the database. */
export function rateLimitKey(action: PublicRateLimitAction, raw: string) {
  return createHash("sha256").update(`${action}:${raw}`).digest("hex");
}

/** The caller's IP as Vercel reports it (first x-forwarded-for hop), or null. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || null;
}

/**
 * Counts one event against a fixed limit (migration 0019) and says whether
 * it's allowed. Needs the service-role client. Fails open: a database hiccup
 * must not stop a supplier from submitting their quote — it's logged instead.
 */
export async function consumePublicRateLimit(
  admin: SupabaseClient,
  action: PublicRateLimitAction,
  raw: string | null
): Promise<boolean> {
  if (!raw) return true;
  try {
    const { data, error } = await admin.rpc("consume_public_rate_limit", {
      p_action: action,
      p_key_hash: rateLimitKey(action, raw),
    });
    if (error) throw new Error(error.message);
    return data !== false;
  } catch (e) {
    console.error(`[rate-limit] ${action} check failed, allowing:`, e instanceof Error ? e.message : e);
    return true;
  }
}
