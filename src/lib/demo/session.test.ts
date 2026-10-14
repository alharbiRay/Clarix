import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
import { openDemoSession, type DemoSessionDeps } from "@/lib/demo/session";

function deps(profiles: Record<string, unknown>[], overrides: Partial<DemoSessionDeps> = {}): DemoSessionDeps {
  const admin = createFakeSupabase({ profiles });
  return {
    admin: admin as never,
    email: "demo@clarix.example",
    generateTokenHash: vi.fn(async () => "hashed-token"),
    verifyTokenHash: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

describe("openDemoSession", () => {
  it("mints a one-time token for the demo account and verifies it into a session", async () => {
    const d = deps([{ id: "d", email: "demo@clarix.example", is_demo: true }]);
    expect(await openDemoSession(d)).toEqual({ ok: true });
    expect(d.generateTokenHash).toHaveBeenCalledWith("demo@clarix.example");
    expect(d.verifyTokenHash).toHaveBeenCalledWith("hashed-token");
  });

  it("never mints a session for an account that isn't flagged as the demo", async () => {
    const d = deps([{ id: "u", email: "demo@clarix.example", is_demo: false }]);
    expect(await openDemoSession(d)).toEqual({ ok: false, reason: "not_configured" });
    expect(d.generateTokenHash).not.toHaveBeenCalled();
  });

  it("reports the demo as unavailable when it hasn't been seeded", async () => {
    expect(await openDemoSession(deps([]))).toEqual({ ok: false, reason: "not_configured" });
  });

  it("reports a failure (without throwing) when token minting or verification fails", async () => {
    const seeded = [{ id: "d", email: "demo@clarix.example", is_demo: true }];
    const mintFails = deps(seeded, { generateTokenHash: vi.fn(async () => { throw new Error("rate limited"); }) });
    expect(await openDemoSession(mintFails)).toEqual({ ok: false, reason: "failed" });
    const verifyFails = deps(seeded, { verifyTokenHash: vi.fn(async () => ({ ok: false as const })) });
    expect(await openDemoSession(verifyFails)).toEqual({ ok: false, reason: "failed" });
  });
});
