import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
const createServerClient = vi.fn((..._args: unknown[]) => ({ auth: { getUser } }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}));

import { middleware, config, AUTH_TIMEOUT_MS } from "@/middleware";

const AUTH_COOKIE = "sb-abcd-auth-token=base64-session";

function request(path: string, cookie?: string) {
  return new NextRequest(`https://clarix.test${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

function location(res: Response) {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname + new URL(loc).search : null;
}

describe("middleware", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    getUser.mockReset();
    createServerClient.mockClear();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.useRealTimers());

  it("redirects a visitor with no session cookie away from a protected route without calling Supabase", async () => {
    const res = await middleware(request("/rfqs"));
    expect(location(res)).toBe("/login?next=%2Frfqs");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("lets a visitor with no session cookie through to a public route without calling Supabase", async () => {
    const res = await middleware(request("/login"));
    expect(location(res)).toBeNull();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("lets a signed-in user through to a protected route", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await middleware(request("/dashboard", AUTH_COOKIE));
    expect(location(res)).toBeNull();
  });

  it("treats a stale cookie (no user returned) as anonymous", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
    const res = await middleware(request("/dashboard", AUTH_COOKIE));
    expect(location(res)).toBe("/login?next=%2Fdashboard");
  });

  it("times out a hanging auth call and redirects a protected route to login with a reason", async () => {
    vi.useFakeTimers();
    getUser.mockReturnValue(new Promise(() => {}));
    const pending = middleware(request("/rfqs/7", AUTH_COOKIE));
    await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS);
    const res = await pending;
    expect(location(res)).toBe("/login?reason=session_unavailable&next=%2Frfqs%2F7");
    const logged = JSON.parse(String(warn.mock.calls[0][0]));
    expect(logged).toMatchObject({ event: "middleware.auth_unavailable", reason: "timeout", path: "/rfqs/7" });
  });

  it("times out a hanging auth call but still serves a public route", async () => {
    vi.useFakeTimers();
    getUser.mockReturnValue(new Promise(() => {}));
    const pending = middleware(request("/login", AUTH_COOKIE));
    await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS);
    expect(location(await pending)).toBeNull();
  });

  it("never throws when the auth call throws", async () => {
    getUser.mockRejectedValue(new Error("fetch failed"));
    const res = await middleware(request("/settings", AUTH_COOKIE));
    expect(location(res)).toBe("/login?reason=session_unavailable&next=%2Fsettings");
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ reason: "error" });
  });

  it("never throws when the Supabase env is missing", async () => {
    createServerClient.mockImplementationOnce(() => {
      throw new Error("supabaseUrl is required");
    });
    const res = await middleware(request("/settings", AUTH_COOKIE));
    expect(location(res)).toBe("/login?reason=session_unavailable&next=%2Fsettings");
  });
});

describe("middleware matcher", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it.each(["/dashboard", "/rfqs/1/compare", "/login", "/settings"])("runs on %s", (p) => {
    expect(matcher.test(p)).toBe(true);
  });

  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/favicon.ico",
    "/logo.svg",
    "/fonts/inter.woff2",
    "/quote/abc123",
    "/api/webhooks/resend-inbound",
    "/api/health",
    "/api/jobs/process",
    "/robots.txt",
    "/sitemap.xml",
  ])("skips %s", (p) => {
    expect(matcher.test(p)).toBe(false);
  });
});
