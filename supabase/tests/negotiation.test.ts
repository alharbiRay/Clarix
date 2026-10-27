import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

describe("migration 0014: rate limits and supplier language", () => {
  let db: TestDb;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    db = await createTestDb();
    alice = await createUser(db, "alice@example.com");
    bob = await createUser(db, "bob@example.com");
  });

  const consume = (user: string, action: string, limit: number) =>
    asUser(db, user, async () => {
      const { rows } = await db.query<{ ok: boolean }>(`select public.consume_rate_limit($1, $2, 3600) as ok`, [action, limit]);
      return rows[0].ok;
    });

  it("allows up to the limit per account and action, then refuses", async () => {
    expect(await consume(alice, "negotiation_draft", 2)).toBe(true);
    expect(await consume(alice, "negotiation_draft", 2)).toBe(true);
    expect(await consume(alice, "negotiation_draft", 2)).toBe(false);
    // Separate buckets per account and per action.
    expect(await consume(bob, "negotiation_draft", 2)).toBe(true);
    expect(await consume(alice, "negotiation_send", 2)).toBe(true);
  });

  it("refused attempts don't count against the window", async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.rate_limit_events where user_id = $1 and action = 'negotiation_draft'`,
      [alice]
    );
    expect(rows[0].n).toBe(2);
  });

  it("only counts events inside the window", async () => {
    await db.query(`update public.rate_limit_events set created_at = now() - interval '2 hours' where user_id = $1`, [alice]);
    expect(await consume(alice, "negotiation_draft", 2)).toBe(true);
  });

  it("the bucket table isn't readable or writable directly", async () => {
    await expect(asUser(db, alice, () => db.query(`select * from public.rate_limit_events`))).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, alice, () => db.query(`insert into public.rate_limit_events (user_id, action) values ($1, 'x')`, [alice]))
    ).rejects.toThrow(/permission denied/);
  });

  it("anonymous callers are refused", async () => {
    await expect(db.query(`set role anon; select public.consume_rate_limit('x', 5, 60)`)).rejects.toThrow();
    await db.exec(`reset role`);
  });

  it("rejects nonsense limits", async () => {
    await expect(consume(alice, "x", 0)).rejects.toThrow(/invalid/);
  });

  it("suppliers can carry a preferred language (ar or en only)", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into suppliers (buyer_id, email, preferred_language) values ($1, 's@x.sa', 'ar') returning id`,
      [alice]
    );
    expect(rows[0].id).toBeTruthy();
    await expect(db.query(`insert into suppliers (buyer_id, email, preferred_language) values ($1, 't@x.sa', 'fr')`, [alice])).rejects.toThrow(
      /check/
    );
  });
});
