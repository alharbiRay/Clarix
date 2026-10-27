import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

describe("migrations 0015 + 0016: rate limits and supplier language", () => {
  let db: TestDb;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    db = await createTestDb();
    alice = await createUser(db, "alice@example.com");
    bob = await createUser(db, "bob@example.com");
  });

  // The caller's numbers are ignored since 0016; pass deliberately hostile ones.
  const consume = (user: string, action: string, limit = 1_000_000_000, windowSeconds = 1) =>
    asUser(db, user, async () => {
      const { rows } = await db.query<{ ok: boolean }>(`select public.consume_rate_limit($1, $2, $3) as ok`, [action, limit, windowSeconds]);
      return rows[0].ok;
    });

  it("allows 20 per hour per account and action, whatever limit the caller passes", async () => {
    for (let i = 0; i < 20; i++) expect(await consume(alice, "negotiation_draft")).toBe(true);
    expect(await consume(alice, "negotiation_draft")).toBe(false);
    // Separate buckets per account and per action.
    expect(await consume(bob, "negotiation_draft")).toBe(true);
    expect(await consume(alice, "negotiation_send")).toBe(true);
  });

  it("a caller-supplied tiny window doesn't reset the bucket (0016 security fix)", async () => {
    expect(await consume(alice, "negotiation_draft", 1_000_000_000, 1)).toBe(false);
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.rate_limit_events where user_id = $1 and action = 'negotiation_draft'`,
      [alice]
    );
    expect(rows[0].n).toBe(20);
  });

  it("only counts the last hour, and cleans up after a day", async () => {
    await db.query(`update public.rate_limit_events set created_at = now() - interval '2 hours' where user_id = $1`, [alice]);
    expect(await consume(alice, "negotiation_draft")).toBe(true);
    await db.query(`update public.rate_limit_events set created_at = now() - interval '2 days' where user_id = $1 and action = 'negotiation_send'`, [alice]);
    await consume(alice, "negotiation_send");
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.rate_limit_events where user_id = $1 and action = 'negotiation_send'`,
      [alice]
    );
    expect(rows[0].n).toBe(1);
  });

  it("refuses unknown actions, so the table can't be filled with junk", async () => {
    await expect(consume(alice, "anything_else")).rejects.toThrow(/unknown action/);
  });

  it("refuses the demo account", async () => {
    const demo = await createUser(db, "demo@clarix.example");
    await db.query(`update profiles set is_demo = true where id = $1`, [demo]);
    await expect(consume(demo, "negotiation_draft")).rejects.toThrow(/demo/);
  });

  it("the bucket table isn't readable or writable directly", async () => {
    await expect(asUser(db, alice, () => db.query(`select * from public.rate_limit_events`))).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, alice, () => db.query(`insert into public.rate_limit_events (user_id, action) values ($1, 'x')`, [alice]))
    ).rejects.toThrow(/permission denied/);
  });

  it("anonymous callers and the service role can't call it", async () => {
    await expect(db.query(`set role anon; select public.consume_rate_limit('negotiation_draft', 5, 60)`)).rejects.toThrow();
    await db.exec(`reset role`);
    await expect(db.query(`set role service_role; select public.consume_rate_limit('negotiation_draft', 5, 60)`)).rejects.toThrow();
    await db.exec(`reset role`);
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
