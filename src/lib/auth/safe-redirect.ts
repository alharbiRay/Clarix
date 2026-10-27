const PLACEHOLDER_ORIGIN = "https://clarix.invalid";

/**
 * Only same-origin, path-only redirects are allowed after login. Rather than
 * pattern-matching the many ways browsers reinterpret a path as a host
 * (`//host`, `/\host`, tabs/newlines the URL parser strips, …), resolve the
 * candidate against a fixed origin and require it to stay on that origin.
 * Control characters and backslashes are rejected outright.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F\\]/.test(next)) return fallback;

  let url: URL;
  try {
    url = new URL(next, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;

  const path = `${url.pathname}${url.search}${url.hash}`;
  if (url.pathname === "/login") return fallback;
  return path;
}
