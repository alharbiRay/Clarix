import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, type TestDb } from "@/test/db";
import { DEMO_SEED, generateDemoDataset } from "@/lib/demo/dataset";
import { writeDemoDataset, type DemoSink } from "@/lib/demo/writer";

/** DemoSink over PGlite — proves the generated rows satisfy every real constraint and FK. */
function pgliteSink(db: TestDb): DemoSink {
  const value = (v: unknown) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);
  return {
    async upsert(table, rows, conflict, opts) {
      for (const row of rows) {
        const cols = Object.keys(row);
        const updates = cols.filter((c) => !conflict.includes(c)).map((c) => `${c} = excluded.${c}`);
        await db.query(
          `insert into public.${table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})
           on conflict (${conflict.join(", ")}) do ${updates.length && !opts?.ignoreDuplicates ? `update set ${updates.join(", ")}` : "nothing"}`,
          cols.map((c) => value(row[c]))
        );
      }
    },
    async updateProfile(id, patch) {
      const cols = Object.keys(patch);
      await db.query(
        `update public.profiles set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1`,
        [id, ...cols.map((c) => patch[c])]
      );
    },
  };
}

async function counts(db: TestDb) {
  const { rows } = await db.query<Record<string, number>>(`select
    (select count(*)::int from rfqs) rfqs, (select count(*)::int from rfq_items) items,
    (select count(*)::int from rfq_suppliers) invites, (select count(*)::int from quotes) quotes,
    (select count(*)::int from quote_items) quote_items, (select count(*)::int from ai_recommendations) recs,
    (select count(*)::int from rfq_awards) awards, (select count(*)::int from notifications) notifications,
    (select count(*)::int from suppliers) suppliers, (select count(*)::int from audit_events) audit`);
  return rows[0];
}

describe("demo seed against real Postgres", () => {
  let db: TestDb;
  let buyer: string;

  beforeAll(async () => {
    db = await createTestDb();
    buyer = await createUser(db, "demo@clarix.example");
  });

  it("inserts the whole dataset without violating any constraint", async () => {
    const data = generateDemoDataset({ seed: DEMO_SEED, now: new Date("2026-10-14T09:00:00Z"), buyerId: buyer });
    const written = await writeDemoDataset(pgliteSink(db), data);
    expect(written.rfqs).toBe(25);
    expect((await counts(db)).quotes).toBe(data.quotes.length);
    const { rows } = await db.query<{ is_demo: boolean; company: string }>(`select is_demo, company from profiles where id = $1`, [buyer]);
    expect(rows[0]).toEqual({ is_demo: true, company: "Al Waha Contracting" });
  });

  it("is idempotent: seeding again (even a week later) changes no counts", async () => {
    const before = await counts(db);
    const later = generateDemoDataset({
      seed: DEMO_SEED,
      now: new Date("2026-10-21T09:00:00Z"),
      buyerId: buyer,
      tokenSecret: "rotated",
    });
    await writeDemoDataset(pgliteSink(db), later);
    expect(await counts(db)).toEqual(before);
  });

  it("flags every top-level demo row", async () => {
    const { rows } = await db.query<{ n: number }>(
      `select (select count(*) from rfqs where not is_demo) + (select count(*) from suppliers where not is_demo) as n`
    );
    expect(Number(rows[0].n)).toBe(0);
  });
});
