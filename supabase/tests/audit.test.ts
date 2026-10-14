import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

describe("audit_events (migration 0011)", () => {
  let db: TestDb;
  let alice: string;
  let bob: string;
  let rfq: string;

  async function insertAsServiceRole(buyer: string, type = "rfq_sent") {
    await db.exec(`set role service_role`);
    try {
      const { rows } = await db.query<{ id: string }>(
        `insert into audit_events (buyer_id, rfq_id, actor_type, event_type, summary, payload)
         values ($1, $2, 'system', $3, 'x', '{}') returning id`,
        [buyer, rfq, type]
      );
      return rows[0].id;
    } finally {
      await db.exec(`reset role`);
    }
  }

  beforeAll(async () => {
    db = await createTestDb();
    alice = await createUser(db, "alice@example.com");
    bob = await createUser(db, "bob@example.com");
    rfq = (await db.query<{ id: string }>(`insert into rfqs (buyer_id, title) values ($1, 'A') returning id`, [alice])).rows[0].id;
  });

  it("the service role (server code) records events", async () => {
    expect(await insertAsServiceRole(alice)).toBeTruthy();
  });

  it("buyers read only their own trail", async () => {
    await insertAsServiceRole(bob);
    const seen = await asUser(db, alice, async () => (await db.query<{ buyer_id: string }>(`select buyer_id from audit_events`)).rows);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((r) => r.buyer_id === alice)).toBe(true);
  });

  it("buyers cannot write the trail directly (no forged events)", async () => {
    await expect(
      asUser(db, alice, () =>
        db.query(`insert into audit_events (buyer_id, actor_type, event_type, summary) values ($1, 'buyer', 'rfq_sent', 'x')`, [alice])
      )
    ).rejects.toThrow(/permission denied|row-level security/);
  });

  it("nobody can edit or delete an event — not even the service role", async () => {
    const id = await insertAsServiceRole(alice);
    for (const role of ["service_role", "authenticated"]) {
      await db.exec(`set role ${role}`);
      if (role === "authenticated") await db.exec(`set request.jwt.claim.sub = '${alice}'`);
      try {
        await expect(db.query(`update audit_events set summary = 'tampered' where id = $1`, [id])).rejects.toThrow();
        await expect(db.query(`delete from audit_events where id = $1`, [id])).rejects.toThrow();
      } finally {
        await db.exec(`reset role; reset request.jwt.claim.sub;`);
      }
    }
    const { rows } = await db.query<{ summary: string }>(`select summary from audit_events where id = $1`, [id]);
    expect(rows[0].summary).toBe("x");
  });

  it("even a direct delete by the owner role is refused (append-only trigger)", async () => {
    const id = await insertAsServiceRole(alice);
    await expect(db.query(`delete from audit_events where id = $1`, [id])).rejects.toThrow(/append-only/);
    await expect(db.query(`update audit_events set summary = 'x2' where id = $1`, [id])).rejects.toThrow(/append-only/);
  });

  it("keeps the trail when the RFQ itself is deleted", async () => {
    const tmp = (await db.query<{ id: string }>(`insert into rfqs (buyer_id, title) values ($1, 'tmp') returning id`, [alice])).rows[0].id;
    await db.exec(`set role service_role`);
    await db.query(`insert into audit_events (buyer_id, rfq_id, actor_type, event_type, summary) values ($1, $2, 'system', 'rfq_created', 'x')`, [alice, tmp]);
    await db.exec(`reset role`);
    await db.query(`delete from rfqs where id = $1`, [tmp]);
    const { rows } = await db.query(`select 1 from audit_events where rfq_id = $1`, [tmp]);
    expect(rows).toHaveLength(1);
  });

  it("rejects unknown event types", async () => {
    await expect(insertAsServiceRole(alice, "made_up")).rejects.toThrow(/check constraint|violates/);
  });

  it("removes a buyer's trail only when the whole account is deleted (cascade)", async () => {
    const carol = await createUser(db, "carol@example.com");
    await insertAsServiceRole(carol);
    await db.query(`delete from auth.users where id = $1`, [carol]);
    const { rows } = await db.query(`select 1 from audit_events where buyer_id = $1`, [carol]);
    expect(rows).toHaveLength(0);
  });
});
