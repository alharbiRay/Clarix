import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
import { openDemoSession, type DemoSessionDeps } from "@/lib/demo/session";

const DEMO = { id: "d", email: "demo@clarix.example", is_demo: true };

function deps(profiles: Record<string, unknown>[], overrides: Partial<DemoSessionDeps> = {}): DemoSessionDeps {
  const admin = createFakeSupabase({ profiles });
  return {
    admin: admin as never,
    email: "demo@clarix.example",
    generateTokenHash: vi.fn(async () => ({ tokenHash: "hashed-token", userId: "d" })),
    verifyTokenHash: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

describe("openDemoSession", () => {
  it("mints a one-time token for the demo account and verifies it into a session", async () => {
    const d = deps([DEMO]);
    expect(await openDemoSession(d)).toEqual({ ok: true });
    expect(d.generateTokenHash).toHaveBeenCalledWith("demo@clarix.example");
    expect(d.verifyTokenHash).toHaveBeenCalledWith("hashed-token");
  });

  it("never mints a session for an account that isn't flagged as the demo", async () => {
    const d = deps([{ ...DEMO, is_demo: false }]);
    expect(await openDemoSession(d)).toEqual({ ok: false, reason: "not_configured" });
    expect(d.generateTokenHash).not.toHaveBeenCalled();
  });

  it("is not broken by another profile claiming the same email", async () => {
    const d = deps([DEMO, { id: "attacker", email: "demo@clarix.example", is_demo: false }]);
    expect(await openDemoSession(d)).toEqual({ ok: true });
  });

  it("refuses if the auth user the token was minted for is not the flagged demo profile", async () => {
    const d = deps([DEMO], { generateTokenHash: vi.fn(async () => ({ tokenHash: "h", userId: "someone-else" })) });
    expect(await openDemoSession(d)).toEqual({ ok: false, reason: "failed" });
    expect(d.verifyTokenHash).not.toHaveBeenCalled();
  });

  it("reports the demo as unavailable when it hasn't been seeded", async () => {
    expect(await openDemoSession(deps([]))).toEqual({ ok: false, reason: "not_configured" });
  });

  it("retries when a concurrent visitor's click superseded our token", async () => {
    const verify = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    const d = deps([DEMO], { verifyTokenHash: verify });
    expect(await openDemoSession(d)).toEqual({ ok: true });
    expect(d.generateTokenHash).toHaveBeenCalledTimes(2);
  });

  it("gives up (without throwing) after repeated failures", async () => {
    const mintFails = deps([DEMO], { generateTokenHash: vi.fn(async () => { throw new Error("rate limited"); }) });
    expect(await openDemoSession(mintFails)).toEqual({ ok: false, reason: "failed" });
    const verifyFails = deps([DEMO], { verifyTokenHash: vi.fn(async () => ({ ok: false })) });
    expect(await openDemoSession(verifyFails)).toEqual({ ok: false, reason: "failed" });
    expect(verifyFails.generateTokenHash).toHaveBeenCalledTimes(3);
  });
});
