import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

describe("jobs queue (migration 0007)", () => {
  let db: TestDb;
  let alice: string;
  let bob: string;
  let rfqA: string;

  beforeAll(async () => {
    db = await createTestDb();
    alice = await createUser(db, "alice@example.com");
    bob = await createUser(db, "bob@example.com");
    rfqA = (await db.query<{ id: string }>(`insert into rfqs (buyer_id, title) values ($1, 'A') returning id`, [alice])).rows[0].id;
  });

  beforeEach(async () => {
    await db.exec(`delete from jobs`);
  });

  async function enqueue(dedupe: string | null = null, rfq = rfqA, buyer = alice) {
    const { rows } = await db.query<{ id: string }>(
      `select enqueue_job('auto_recommendation', $1, $2, '{}'::jsonb, $3) as id`,
      [buyer, rfq, dedupe]
    );
    return rows[0].id;
  }

  it("dedupes a second enqueue while the first is still pending", async () => {
    const first = await enqueue("auto_recommendation:A");
    const second = await enqueue("auto_recommendation:A");
    expect(second).toBe(first);
    const { rows } = await db.query(`select id from jobs`);
    expect(rows).toHaveLength(1);
  });

  it("allows a new pending job once the earlier one is running", async () => {
    await enqueue("auto_recommendation:A");
    await db.query(`select * from claim_jobs(10)`);
    await enqueue("auto_recommendation:A");
    const { rows } = await db.query<{ status: string }>(`select status from jobs order by created_at`);
    expect(rows.map((r) => r.status).sort()).toEqual(["pending", "running"]);
  });

  it("claims a pending job exactly once and counts the attempt", async () => {
    await enqueue();
    const first = await db.query<{ attempts: number; status: string }>(`select * from claim_jobs(10)`);
    const second = await db.query(`select * from claim_jobs(10)`);
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0]).toMatchObject({ attempts: 1, status: "running" });
    expect(second.rows).toHaveLength(0);
  });

  it("does not claim jobs scheduled for later", async () => {
    const id = await enqueue();
    await db.query(`update jobs set run_after = now() + interval '1 hour' where id = $1`, [id]);
    expect((await db.query(`select * from claim_jobs(10)`)).rows).toHaveLength(0);
  });

  it("reclaims a job whose worker died mid-run", async () => {
    const id = await enqueue();
    await db.query(`select * from claim_jobs(10)`);
    await db.query(`update jobs set locked_at = now() - interval '10 minutes' where id = $1`, [id]);
    const { rows } = await db.query<{ attempts: number }>(`select * from claim_jobs(10)`);
    expect(rows[0].attempts).toBe(2);
  });

  it("can claim one specific job by id", async () => {
    await enqueue();
    const target = await enqueue();
    const { rows } = await db.query<{ id: string }>(`select * from claim_jobs(10, $1)`, [target]);
    expect(rows.map((r) => r.id)).toEqual([target]);
  });

  it("RLS: buyers can read only their own jobs", async () => {
    const rfqB = (await db.query<{ id: string }>(`insert into rfqs (buyer_id, title) values ($1, 'B') returning id`, [bob])).rows[0].id;
    await enqueue(null, rfqA, alice);
    await enqueue(null, rfqB, bob);
    const seen = await asUser(db, alice, async () => (await db.query<{ buyer_id: string }>(`select buyer_id from jobs`)).rows);
    expect(seen).toEqual([{ buyer_id: alice }]);
  });

  it("buyers cannot enqueue, claim, or write jobs directly", async () => {
    await expect(asUser(db, alice, () => db.query(`select * from claim_jobs(10)`))).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, alice, () => db.query(`select enqueue_job('x', $1, null)`, [alice]))
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, alice, () => db.query(`insert into jobs (type, buyer_id) values ('x', $1)`, [alice]))
    ).rejects.toThrow(/row-level security|permission denied/);
  });

  it("buyers can read a job's status but not its internals (payload, last_error, result)", async () => {
    await enqueue(null, rfqA, alice);
    const status = await asUser(db, alice, async () => (await db.query(`select status, attempts, run_after from jobs`)).rows);
    expect(status).toHaveLength(1);
    await expect(asUser(db, alice, () => db.query(`select last_error from jobs`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, alice, () => db.query(`select payload from jobs`))).rejects.toThrow(/permission denied/);
  });

  it("anonymous visitors can't read jobs at all", async () => {
    await enqueue(null, rfqA, alice);
    await db.exec(`set role anon`);
    try {
      await expect(db.query(`select status from jobs`)).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec(`reset role`);
    }
  });
});

describe("ai_recommendations idempotency (migration 0007)", () => {
  it("allows many manual recommendations but only one auto-generated one per RFQ", async () => {
    const db = await createTestDb();
    const alice = await createUser(db, "a@example.com");
    const rfq = (await db.query<{ id: string }>(`insert into rfqs (buyer_id, title) values ($1, 'A') returning id`, [alice])).rows[0].id;
    const insert = (auto: boolean) =>
      db.query(`insert into ai_recommendations (rfq_id, content, model, auto_generated) values ($1, '{}', 'm', $2)`, [rfq, auto]);
    await insert(false);
    await insert(false);
    await insert(true);
    await expect(insert(true)).rejects.toThrow(/duplicate key/);
  });
});
