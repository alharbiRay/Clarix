import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/auth-js";
import { NextResponse, type NextRequest } from "next/server";
import { decideAccess, type AuthOutcome } from "@/lib/auth/route-access";
import { TimeoutError, withTimeout } from "@/lib/auth/with-timeout";

/**
 * Hard ceiling on the Supabase auth round-trip. Vercel kills middleware that
 * runs too long with a 504 MIDDLEWARE_INVOCATION_TIMEOUT — the production
 * outage this guards against was an un-timed `auth.getUser()` hanging on a
 * slow Supabase Auth response and taking every page down with it.
 */
export const AUTH_TIMEOUT_MS = 2500;

/** Supabase SSR stores the session in `sb-<project-ref>-auth-token` (optionally chunked `.0`, `.1`). */
function hasSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

/** Network failure, abort, or a 5xx from Supabase Auth — as opposed to "you have no valid session". */
function isOutage(error: unknown) {
  if (isAuthRetryableFetchError(error)) return true;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && (status === 0 || status >= 500);
}

/** fetch that aborts itself at the deadline, so a hung socket is actually released. */
function timeoutFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(AUTH_TIMEOUT_MS) });
}

function logUnavailable(pathname: string, reason: "timeout" | "error", error: unknown) {
  console.warn(
    JSON.stringify({
      event: "middleware.auth_unavailable",
      reason,
      path: pathname,
      timeoutMs: AUTH_TIMEOUT_MS,
      error: error instanceof Error ? error.message : String(error),
    })
  );
}

/**
 * Does the minimum: refresh the Supabase session cookie and gate protected
 * routes. Never throws and never waits longer than AUTH_TIMEOUT_MS — on a
 * timeout or error public routes continue and protected routes redirect to
 * /login with a reason the login page explains. Authorization proper still
 * happens server-side (layouts, server actions, RLS); this is only a gate.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  let auth: AuthOutcome = { status: "anonymous" };
  if (hasSessionCookie(request)) {
    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { fetch: timeoutFetch },
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
              response = NextResponse.next({ request });
              cookiesToSet.forEach(({ name, value, options }) =>
                response.cookies.set(name, value, options)
              );
            },
          },
        }
      );
      const { data, error } = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS, "auth.getUser");
      if (data.user) {
        auth = { status: "authenticated", userId: data.user.id };
      } else if (error && isOutage(error)) {
        // auth-js doesn't throw on network failures, aborts or 5xx — it
        // returns them. Only a definitive "no/invalid session" is anonymous.
        logUnavailable(pathname, "error", error);
        auth = { status: "unavailable", reason: "error" };
      } else {
        auth = { status: "anonymous" };
      }
    } catch (e) {
      const isTimeout =
        e instanceof TimeoutError || (e instanceof Error && e.name === "TimeoutError");
      const reason = isTimeout ? "timeout" : "error";
      logUnavailable(pathname, reason, e);
      auth = { status: "unavailable", reason };
    }
  }

  const decision = decideAccess(pathname, auth);
  if (decision.type === "redirect") {
    const redirect = NextResponse.redirect(new URL(decision.location, request.url));
    // A token refresh may have rotated the session cookies before we decided
    // to redirect — dropping them would lose the new refresh token.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  // Skip static assets, the public supplier form, the signature-verified
  // inbound webhook, the health check, and the secret-protected job runner —
  // none of them need a session, so none of them should pay for (or be
  // blocked by) an auth round-trip.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|quote/|api/webhooks|api/health|api/jobs|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|txt|xml|map)$).*)",
  ],
};
