import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb, createUser, type TestDb } from "@/test/db";

describe("migration 0020: waitlist leads", () => {
  let db: TestDb;
  let buyer: string;

  beforeAll(async () => {
    db = await createTestDb();
    buyer = await createUser(db, "buyer@example.com");
  });

  const insert = (email: string, extra: Record<string, string> = {}) =>
    db.query(
      `insert into leads (name, email, company, team_size, tier, locale) values ($1, $2, $3, $4, $5, $6)`,
      ["Sara", email, extra.company ?? null, extra.team_size ?? null, extra.tier ?? null, extra.locale ?? null]
    );

  it("stores a valid lead, one row per email (case-insensitive)", async () => {
    await insert("sara@company.sa", { team_size: "11-50", tier: "team", locale: "ar" });
    await expect(insert("SARA@company.sa")).rejects.toThrow(/duplicate|unique/);
  });

  it("rejects malformed emails and unknown values", async () => {
    await expect(insert("not-an-email")).rejects.toThrow(/check/);
    await expect(insert("a@b.sa", { team_size: "huge" })).rejects.toThrow(/check/);
    await expect(insert("c@d.sa", { tier: "enterprise" })).rejects.toThrow(/check/);
  });

  it("is invisible and unwritable through the API", async () => {
    await expect(asAnon(db, () => db.query(`select * from leads`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, buyer, () => db.query(`select * from leads`))).rejects.toThrow(/permission denied/);
    await expect(asAnon(db, () => insert("x@y.sa"))).rejects.toThrow(/permission denied/);
  });

  it("rate limits waitlist sign-ups per key", async () => {
    const key = "c".repeat(64);
    const consume = () =>
      db.query<{ ok: boolean }>(`select public.consume_public_rate_limit('lead_submit_ip', $1) ok`, [key]).then((r) => r.rows[0].ok);
    for (let i = 0; i < 5; i++) expect(await consume()).toBe(true);
    expect(await consume()).toBe(false);
  });
});
