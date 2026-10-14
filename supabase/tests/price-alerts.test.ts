import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

describe("price alert threshold (migration 0010)", () => {
  let db: TestDb;
  let buyer: string;
  let other: string;

  beforeAll(async () => {
    db = await createTestDb();
    buyer = await createUser(db, "buyer@example.com");
    other = await createUser(db, "other@example.com");
  });

  it("defaults to 10%", async () => {
    const { rows } = await db.query<{ t: string }>(`select price_alert_threshold::text t from profiles where id = $1`, [buyer]);
    expect(Number(rows[0].t)).toBe(0.1);
  });

  it("lets a buyer change their own threshold", async () => {
    await asUser(db, buyer, () => db.query(`update profiles set price_alert_threshold = 0.05 where id = $1`, [buyer]));
    const { rows } = await db.query<{ t: string }>(`select price_alert_threshold::text t from profiles where id = $1`, [buyer]);
    expect(Number(rows[0].t)).toBe(0.05);
  });

  it("rejects values outside 1%–100%", async () => {
    await expect(
      asUser(db, buyer, () => db.query(`update profiles set price_alert_threshold = 2 where id = $1`, [buyer]))
    ).rejects.toThrow(/check constraint|violates/);
    await expect(
      asUser(db, buyer, () => db.query(`update profiles set price_alert_threshold = 0 where id = $1`, [buyer]))
    ).rejects.toThrow(/check constraint|violates/);
  });

  it("can't change someone else's threshold", async () => {
    await asUser(db, buyer, () => db.query(`update profiles set price_alert_threshold = 0.5 where id = $1`, [other]));
    const { rows } = await db.query<{ t: string }>(`select price_alert_threshold::text t from profiles where id = $1`, [other]);
    expect(Number(rows[0].t)).toBe(0.1);
  });
});
