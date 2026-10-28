import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb, createUser, type TestDb } from "@/test/db";

const KEY = "a".repeat(64);
const OTHER = "b".repeat(64);

describe("migration 0019: public rate limits", () => {
  let db: TestDb;
  let buyer: string;

  beforeAll(async () => {
    db = await createTestDb();
    buyer = await createUser(db, "buyer@example.com");
  });

  const consume = (action: string, key = KEY) =>
    db.query<{ ok: boolean }>(`select public.consume_public_rate_limit($1, $2) ok`, [action, key]).then((r) => r.rows[0].ok);

  it("allows up to the fixed limit per key, then refuses", async () => {
    for (let i = 0; i < 10; i++) expect(await consume("quote_submit_token")).toBe(true);
    expect(await consume("quote_submit_token")).toBe(false);
    // Separate buckets per key and per action.
    expect(await consume("quote_submit_token", OTHER)).toBe(true);
    expect(await consume("quote_submit_ip")).toBe(true);
  });

  it("rejects unknown actions and keys that aren't hashes", async () => {
    await expect(consume("anything")).rejects.toThrow(/unknown action/);
    await expect(consume("demo_start_ip", "203.0.113.7")).rejects.toThrow(/invalid key/);
  });

  it("visitors and buyers can't call it or read the table", async () => {
    await expect(asAnon(db, () => consume("demo_start_ip"))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, buyer, () => consume("demo_start_ip"))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, buyer, () => db.query(`select * from public_rate_limit_events`))).rejects.toThrow(/permission denied/);
  });
});
