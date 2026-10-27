import { describe, expect, it } from "vitest";
import { assertSeedAllowed } from "@/lib/demo/seed-guard";

const LOCAL = "http://127.0.0.1:54321";
const REMOTE = "https://abcdefghijklmnop.supabase.co";

describe("assertSeedAllowed", () => {
  it("refuses without ALLOW_SEED=true", () => {
    expect(() => assertSeedAllowed({ NEXT_PUBLIC_SUPABASE_URL: LOCAL })).toThrow(/ALLOW_SEED=true/);
    expect(() => assertSeedAllowed({ NEXT_PUBLIC_SUPABASE_URL: LOCAL, ALLOW_SEED: "1" })).toThrow(/ALLOW_SEED=true/);
  });

  it("allows a local Supabase stack", () => {
    expect(assertSeedAllowed({ NEXT_PUBLIC_SUPABASE_URL: LOCAL, ALLOW_SEED: "true" })).toEqual({ target: "local" });
    expect(assertSeedAllowed({ NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321", ALLOW_SEED: "true" })).toEqual({
      target: "local",
    });
  });

  it("refuses a hosted project unless its exact project ref is confirmed", () => {
    expect(() => assertSeedAllowed({ NEXT_PUBLIC_SUPABASE_URL: REMOTE, ALLOW_SEED: "true" })).toThrow(
      /DEMO_SEED_PROJECT_REF=abcdefghijklmnop/
    );
    expect(() =>
      assertSeedAllowed({ NEXT_PUBLIC_SUPABASE_URL: REMOTE, ALLOW_SEED: "true", DEMO_SEED_PROJECT_REF: "other" })
    ).toThrow(/does not match/);
    expect(
      assertSeedAllowed({ NEXT_PUBLIC_SUPABASE_URL: REMOTE, ALLOW_SEED: "true", DEMO_SEED_PROJECT_REF: "abcdefghijklmnop" })
    ).toEqual({ target: "remote", projectRef: "abcdefghijklmnop" });
  });

  it("refuses when the URL is missing or not a Supabase/local URL", () => {
    expect(() => assertSeedAllowed({ ALLOW_SEED: "true" })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => assertSeedAllowed({ ALLOW_SEED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com" })).toThrow(
      /not a recognised/
    );
  });
});
