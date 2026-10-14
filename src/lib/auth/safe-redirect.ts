/**
 * Only same-origin, path-only redirects are allowed after login — never
 * protocol-relative (`//host`) or backslash tricks browsers treat as hosts.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next === "/login" || next.startsWith("/login?")) return fallback;
  return next;
}
