import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

describe("approval policies and roles (migration 0013)", () => {
  let db: TestDb;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    db = await createTestDb();
    alice = await createUser(db, "alice@example.com");
    bob = await createUser(db, "bob@example.com");
  });

  it("existing accounts are managers and nobody can promote or demote themselves", async () => {
    const { rows } = await db.query<{ role: string }>(`select role from profiles where id = $1`, [alice]);
    expect(rows[0].role).toBe("manager");
    await asUser(db, alice, () => db.query(`update profiles set role = 'buyer' where id = $1`, [alice])).catch(() => undefined);
    expect((await db.query<{ role: string }>(`select role from profiles where id = $1`, [alice])).rows[0].role).toBe("manager");
  });

  it("a buyer can create and change their own policy, with validation", async () => {
    await asUser(db, alice, () =>
      db.query(`insert into approval_policies (buyer_id, max_delivery_days, spend_limit) values ($1, 21, 50000)
                on conflict (buyer_id) do update set max_delivery_days = 21, spend_limit = 50000`, [alice])
    );
    const { rows } = await db.query<{ max_delivery_days: number }>(`select max_delivery_days from approval_policies where buyer_id = $1`, [alice]);
    expect(rows[0].max_delivery_days).toBe(21);
    await expect(
      asUser(db, alice, () => db.query(`update approval_policies set max_delivery_days = 0 where buyer_id = $1`, [alice]))
    ).rejects.toThrow(/check constraint|violates/);
    await expect(
      asUser(db, alice, () => db.query(`update approval_policies set min_supplier_score = 150 where buyer_id = $1`, [alice]))
    ).rejects.toThrow(/check constraint|violates/);
  });

  it("buyers can't read or write someone else's policy", async () => {
    await db.query(`insert into approval_policies (buyer_id) values ($1) on conflict do nothing`, [bob]);
    const seen = await asUser(db, alice, async () => (await db.query(`select buyer_id from approval_policies where buyer_id = $1`, [bob])).rows);
    expect(seen).toHaveLength(0);
    await expect(
      asUser(db, alice, () => db.query(`insert into approval_policies (buyer_id) values ($1)`, [bob]))
    ).rejects.toThrow(/row-level security|duplicate/);
  });

  it("the demo account can't change its policy", async () => {
    const demo = await createUser(db, "demo@clarix.example");
    await db.query(`update profiles set is_demo = true where id = $1`, [demo]);
    await expect(
      asUser(db, demo, () => db.query(`insert into approval_policies (buyer_id) values ($1)`, [demo]))
    ).rejects.toThrow(/row-level security/);
  });
});

describe("migration 0013 backfill", () => {
  it("copies each account's existing auto-approval toggle into its policy", async () => {
    // Re-run the backfill statement on a fresh db where one buyer had switched it off.
    const db = await createTestDb();
    const off = await createUser(db, "off@example.com");
    await db.query(`update profiles set auto_approval_enabled = false where id = $1`, [off]);
    await db.query(`delete from approval_policies`);
    await db.exec(`insert into public.approval_policies (buyer_id, enabled)
                   select id, auto_approval_enabled from public.profiles on conflict (buyer_id) do nothing`);
    const { rows } = await db.query<{ enabled: boolean }>(`select enabled from approval_policies where buyer_id = $1`, [off]);
    expect(rows[0].enabled).toBe(false);
  });
});
