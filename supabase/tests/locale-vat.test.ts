import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

describe("migration 0017: locale and VAT", () => {
  let db: TestDb;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    db = await createTestDb();
    alice = await createUser(db, "alice@example.com");
    bob = await createUser(db, "bob@example.com");
  });

  it("defaults to Saudi VAT (15%) and no saved language", async () => {
    const { rows } = await db.query<{ vat_rate: string; locale: string | null }>(`select vat_rate, locale from profiles where id = $1`, [alice]);
    expect(Number(rows[0].vat_rate)).toBe(0.15);
    expect(rows[0].locale).toBeNull();
  });

  it("a buyer can change their own language and VAT rate, within bounds", async () => {
    await asUser(db, alice, () => db.query(`update profiles set locale = 'ar', vat_rate = 0 where id = $1`, [alice]));
    const { rows } = await db.query<{ vat_rate: string; locale: string }>(`select vat_rate, locale from profiles where id = $1`, [alice]);
    expect(rows[0]).toMatchObject({ locale: "ar" });
    expect(Number(rows[0].vat_rate)).toBe(0);
    await expect(asUser(db, alice, () => db.query(`update profiles set locale = 'fr' where id = $1`, [alice]))).rejects.toThrow(/check/);
    await expect(asUser(db, alice, () => db.query(`update profiles set vat_rate = 2 where id = $1`, [alice]))).rejects.toThrow(/check/);
  });

  it("can't change someone else's", async () => {
    await asUser(db, alice, () => db.query(`update profiles set locale = 'ar' where id = $1`, [bob]));
    const { rows } = await db.query<{ locale: string | null }>(`select locale from profiles where id = $1`, [bob]);
    expect(rows[0].locale).toBeNull();
  });
});
