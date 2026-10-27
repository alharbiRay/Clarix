import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb, createUser, type TestDb } from "@/test/db";

describe("security hardening (migration 0012)", () => {
  let db: TestDb;
  let buyer: string;
  beforeAll(async () => {
    db = await createTestDb();
    buyer = await createUser(db, "buyer@example.com");
  });

  it("the signup trigger function can't be called through the API", async () => {
    await expect(asAnon(db, () => db.query(`select public.handle_new_user()`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, buyer, () => db.query(`select public.handle_new_user()`))).rejects.toThrow(/permission denied/);
  });

  it("signups still create a profile (the trigger itself keeps working)", async () => {
    const id = await createUser(db, "new@example.com");
    const { rows } = await db.query(`select 1 from profiles where id = $1`, [id]);
    expect(rows).toHaveLength(1);
  });

  it("anonymous callers can't probe is_demo_account; signed-in RLS still works", async () => {
    await expect(asAnon(db, () => db.query(`select public.is_demo_account()`))).rejects.toThrow(/permission denied/);
    const { rows } = await asUser(db, buyer, () => db.query<{ d: boolean }>(`select public.is_demo_account() d`));
    expect(rows[0].d).toBe(false);
    await asUser(db, buyer, () => db.query(`insert into rfqs (buyer_id, title) values ($1, 'ok')`, [buyer]));
  });

  it("set_updated_at has a fixed search_path", async () => {
    const { rows } = await db.query<{ cfg: string[] | null }>(`select proconfig cfg from pg_proc where proname = 'set_updated_at'`);
    expect(rows[0].cfg?.join(",")).toMatch(/search_path=/);
  });
});
