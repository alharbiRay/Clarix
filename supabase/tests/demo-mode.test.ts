import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

/**
 * Migration 0008: the demo account is read-only at the database level, so
 * even a hand-crafted request with the demo session can't change anything
 * that every visitor shares.
 */
describe("demo mode (migration 0008)", () => {
  let db: TestDb;
  let demo: string;
  let buyer: string;
  let demoRfq: string;
  let demoQuote: string;
  let demoInvite: string;
  let demoItem: string;

  beforeAll(async () => {
    db = await createTestDb();
    demo = await createUser(db, "demo@clarix.example");
    buyer = await createUser(db, "real@buyer.example");
    await db.query(`update profiles set is_demo = true where id = $1`, [demo]);

    demoRfq = (await db.query<{ id: string }>(
      `insert into rfqs (buyer_id, title, is_demo) values ($1, 'Demo RFQ', true) returning id`, [demo]
    )).rows[0].id;
    demoItem = (await db.query<{ id: string }>(
      `insert into rfq_items (rfq_id, name) values ($1, 'Cement') returning id`, [demoRfq]
    )).rows[0].id;
    demoInvite = (await db.query<{ id: string }>(
      `insert into rfq_suppliers (rfq_id, email) values ($1, 's@x.example') returning id`, [demoRfq]
    )).rows[0].id;
    demoQuote = (await db.query<{ id: string }>(
      `insert into quotes (rfq_id, supplier_id, source, status) values ($1, $2, 'form', 'submitted') returning id`,
      [demoRfq, demoInvite]
    )).rows[0].id;
    await db.query(`insert into notifications (buyer_id, rfq_id, type, message) values ($1, $2, 'auto_approved', 'x')`, [demo, demoRfq]);
    await db.query(`insert into suppliers (buyer_id, email, is_demo) values ($1, 's@x.example', true)`, [demo]);
  });

  const asDemo = <T>(fn: () => Promise<T>) => asUser(db, demo, fn);

  it("adds is_demo flags defaulting to false", async () => {
    const { rows } = await db.query<{ is_demo: boolean }>(`select is_demo from profiles where id = $1`, [buyer]);
    expect(rows[0].is_demo).toBe(false);
  });

  it("lets the demo account read its own data", async () => {
    const titles = await asDemo(async () => (await db.query<{ title: string }>(`select title from rfqs`)).rows);
    expect(titles).toEqual([{ title: "Demo RFQ" }]);
    const quotes = await asDemo(async () => (await db.query(`select id from quotes`)).rows);
    expect(quotes).toHaveLength(1);
  });

  it.each([
    ["create an RFQ", (d: string) => [`insert into rfqs (buyer_id, title) values ($1, 'x')`, [d]]],
    ["rename an RFQ", () => [`update rfqs set title = 'hacked'`, []]],
    ["delete an RFQ", () => [`delete from rfqs`, []]],
    ["add a line item", () => [`insert into rfq_items (rfq_id, name) values ((select id from rfqs limit 1), 'x')`, []]],
    ["invite a supplier", () => [`insert into rfq_suppliers (rfq_id, email) values ((select id from rfqs limit 1), 'new@x.example')`, []]],
    ["edit a quote", () => [`update quotes set delivery_days = 1`, []]],
    ["delete a quote", () => [`delete from quotes`, []]],
    ["save AI preferences", () => [`insert into rfq_preferences (rfq_id, weights) values ((select id from rfqs limit 1), '{}')`, []]],
    ["store a recommendation", () => [`insert into ai_recommendations (rfq_id, content, model) values ((select id from rfqs limit 1), '{}', 'm')`, []]],
    ["approve an award", () => [`insert into rfq_awards (rfq_id, decision) values ((select id from rfqs limit 1), 'review_needed')`, []]],
    ["edit a supplier", () => [`update suppliers set notes = 'x'`, []]],
    ["edit the profile", () => [`update profiles set full_name = 'x'`, []]],
    ["dismiss a notification", () => [`update notifications set read_at = now()`, []]],
  ] as const)("blocks the demo account trying to %s", async (_label, build) => {
    const [sql, params] = build(demo) as unknown as [string, unknown[]];
    const before = await db.query(`select
      (select count(*) from rfqs) r, (select count(*) from rfq_items) i, (select count(*) from rfq_suppliers) s,
      (select count(*) from quotes where delivery_days is null) q, (select count(*) from rfq_preferences) p,
      (select count(*) from ai_recommendations) a, (select count(*) from rfq_awards) aw,
      (select count(*) from suppliers where notes is null) sn, (select count(*) from profiles where full_name is null) pf,
      (select count(*) from notifications where read_at is null) n, (select string_agg(title, ',') from rfqs) t`);
    // Writes are either rejected outright (insert) or silently affect zero rows (update/delete) — both leave data untouched.
    await asDemo(() => db.query(sql, params)).catch(() => undefined);
    const after = await db.query(before.fields.length ? `select
      (select count(*) from rfqs) r, (select count(*) from rfq_items) i, (select count(*) from rfq_suppliers) s,
      (select count(*) from quotes where delivery_days is null) q, (select count(*) from rfq_preferences) p,
      (select count(*) from ai_recommendations) a, (select count(*) from rfq_awards) aw,
      (select count(*) from suppliers where notes is null) sn, (select count(*) from profiles where full_name is null) pf,
      (select count(*) from notifications where read_at is null) n, (select string_agg(title, ',') from rfqs) t` : "");
    expect(after.rows).toEqual(before.rows);
  });

  it("rejects demo inserts with an RLS error (not a silent no-op)", async () => {
    await expect(asDemo(() => db.query(`insert into rfqs (buyer_id, title) values ($1, 'x')`, [demo]))).rejects.toThrow(
      /row-level security/
    );
  });

  it("leaves real buyers completely unaffected", async () => {
    await asUser(db, buyer, async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into rfqs (buyer_id, title) values ($1, 'Real RFQ') returning id`, [buyer]
      );
      await db.query(`update rfqs set title = 'Renamed' where id = $1`, [rows[0].id]);
      await db.query(`update profiles set full_name = 'Real Person' where id = $1`, [buyer]);
    });
    const { rows } = await db.query(`select title from rfqs where buyer_id = $1`, [buyer]);
    expect(rows).toEqual([{ title: "Renamed" }]);
  });

  it("does not let a buyer change their profile email (it would impersonate the demo lookup)", async () => {
    await asUser(db, buyer, () => db.query(`update profiles set email = 'demo@clarix.example' where id = $1`, [buyer])).catch(() => undefined);
    const { rows } = await db.query<{ email: string }>(`select email from profiles where id = $1`, [buyer]);
    expect(rows[0].email).toBe("real@buyer.example");
  });

  it("does not let a real buyer flip themselves (or anyone) into or out of demo mode", async () => {
    await asUser(db, buyer, () => db.query(`update profiles set is_demo = true where id = $1`, [buyer])).catch(() => undefined);
    const { rows } = await db.query<{ is_demo: boolean }>(`select is_demo from profiles where id = $1`, [buyer]);
    expect(rows[0].is_demo).toBe(false);
  });

  it("keeps referenced demo ids stable for the tests above", () => {
    expect([demoRfq, demoQuote, demoInvite, demoItem].every(Boolean)).toBe(true);
  });
});
