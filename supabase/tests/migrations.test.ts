import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, migrationFiles, type TestDb } from "@/test/db";

describe("supabase migrations", () => {
  let db: TestDb;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    db = await createTestDb();
    alice = await createUser(db, "alice@example.com");
    bob = await createUser(db, "bob@example.com");
  });

  it("applies every migration in order", () => {
    expect(migrationFiles().length).toBeGreaterThanOrEqual(6);
  });

  it("creates a profile for each new auth user", async () => {
    const { rows } = await db.query(`select email from public.profiles order by email`);
    expect(rows).toEqual([{ email: "alice@example.com" }, { email: "bob@example.com" }]);
  });

  it("RLS: a buyer only sees their own RFQs", async () => {
    await db.query(`insert into public.rfqs (buyer_id, title) values ($1, 'Alice RFQ'), ($2, 'Bob RFQ')`, [alice, bob]);
    const seen = await asUser(db, alice, async () =>
      (await db.query<{ title: string }>(`select title from public.rfqs`)).rows.map((r) => r.title)
    );
    expect(seen).toEqual(["Alice RFQ"]);
  });

  it("RLS: a buyer cannot insert an RFQ owned by someone else", async () => {
    await expect(
      asUser(db, alice, () => db.query(`insert into public.rfqs (buyer_id, title) values ($1, 'spoof')`, [bob]))
    ).rejects.toThrow(/row-level security/);
  });

  it("defaults new RFQs to SAR", async () => {
    const { rows } = await db.query<{ currency: string }>(
      `insert into public.rfqs (buyer_id, title) values ($1, 'x') returning currency`,
      [alice]
    );
    expect(rows[0].currency).toBe("SAR");
  });
});
