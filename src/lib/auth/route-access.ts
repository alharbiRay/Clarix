/**
 * Pure routing rules for src/middleware.ts — kept free of Next/Supabase so
 * every branch (including auth timeouts) is unit-testable.
 */

/** Routes reachable without a session. Prefix match on whole path segments. */
const PUBLIC_PREFIXES = [
  "/login",
  "/auth",
  "/quote", // supplier form — the token in the URL is the credential
  "/api/webhooks", // signature-verified
  "/api/health",
  "/api/jobs", // CRON_SECRET-protected
  "/demo", // demo entry page (the session itself is opened by a POST server action)
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type AuthOutcome =
  | { status: "authenticated"; userId: string }
  | { status: "anonymous" }
  | { status: "unavailable"; reason: "timeout" | "error" };

export type AccessDecision = { type: "next" } | { type: "redirect"; location: string };

export function decideAccess(pathname: string, auth: AuthOutcome): AccessDecision {
  if (auth.status === "authenticated" && pathname === "/login") {
    return { type: "redirect", location: "/dashboard" };
  }
  if (isPublicPath(pathname) || auth.status === "authenticated") {
    return { type: "next" };
  }
  const next = encodeURIComponent(pathname);
  if (auth.status === "unavailable") {
    return { type: "redirect", location: `/login?reason=session_unavailable&next=${next}` };
  }
  return { type: "redirect", location: `/login?next=${next}` };
}
