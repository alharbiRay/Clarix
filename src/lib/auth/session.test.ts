import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
import { DEMO_READ_ONLY_ERROR, requireWritableUser } from "@/lib/auth/session";

function client(user: { id: string } | null, profiles: Record<string, unknown>[] = []) {
  const db = createFakeSupabase({ profiles });
  return Object.assign(db, { auth: { getUser: async () => ({ data: { user }, error: null }) } });
}

describe("requireWritableUser", () => {
  it("rejects anonymous callers", async () => {
    expect(await requireWritableUser(client(null) as never)).toEqual({ error: "Not authenticated" });
  });

  it("rejects the demo account with a friendly read-only message", async () => {
    const result = await requireWritableUser(client({ id: "d" }, [{ id: "d", is_demo: true }]) as never);
    expect(result).toEqual({ error: DEMO_READ_ONLY_ERROR });
  });

  it("returns the user for a normal buyer", async () => {
    const result = await requireWritableUser(client({ id: "u" }, [{ id: "u", is_demo: false }]) as never);
    expect(result).toEqual({ user: { id: "u" } });
  });

  it("fails closed when the profile can't be read", async () => {
    expect(await requireWritableUser(client({ id: "ghost" }) as never)).toEqual({ error: "Could not verify your account. Try again." });
  });
});
