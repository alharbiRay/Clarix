import { describe, expect, it } from "vitest";
import { decideAccess, isPublicPath } from "@/lib/auth/route-access";

describe("isPublicPath", () => {
  it.each(["/", "/login", "/auth/callback", "/quote/abc", "/api/webhooks/resend-inbound", "/api/health", "/api/jobs/process", "/demo", "/pricing", "/opengraph-image"])(
    "%s is public",
    (p) => expect(isPublicPath(p)).toBe(true)
  );

  it.each(["/dashboard", "/rfqs", "/rfqs/1/compare", "/settings", "/suppliers", "/reports", "/loginx", "/quotes", "/demo-x", "/pricingx"])(
    "%s is protected",
    (p) => expect(isPublicPath(p)).toBe(false)
  );
});

describe("decideAccess", () => {
  it("lets anonymous visitors through to public routes", () => {
    expect(decideAccess("/quote/tok", { status: "anonymous" })).toEqual({ type: "next" });
  });

  it("redirects anonymous visitors on protected routes to login, remembering where they were going", () => {
    expect(decideAccess("/rfqs/42", { status: "anonymous" })).toEqual({
      type: "redirect",
      location: "/login?next=%2Frfqs%2F42",
    });
  });

  it("lets authenticated users through to protected routes", () => {
    expect(decideAccess("/dashboard", { status: "authenticated", userId: "u1" })).toEqual({ type: "next" });
  });

  it("sends authenticated users away from the login page", () => {
    expect(decideAccess("/login", { status: "authenticated", userId: "u1" })).toEqual({
      type: "redirect",
      location: "/dashboard",
    });
  });

  it("on auth timeout, public routes continue", () => {
    expect(decideAccess("/login", { status: "unavailable", reason: "timeout" })).toEqual({ type: "next" });
  });

  it("on auth timeout, protected routes redirect to login with a reason", () => {
    expect(decideAccess("/rfqs", { status: "unavailable", reason: "timeout" })).toEqual({
      type: "redirect",
      location: "/login?reason=session_unavailable&next=%2Frfqs",
    });
  });

  it("on auth error, protected routes redirect to login with a reason", () => {
    expect(decideAccess("/settings", { status: "unavailable", reason: "error" })).toEqual({
      type: "redirect",
      location: "/login?reason=session_unavailable&next=%2Fsettings",
    });
  });
});
