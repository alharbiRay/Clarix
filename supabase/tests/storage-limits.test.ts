import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";

describe("migration 0018: quote PDF bucket limits", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it("caps quote PDFs at 10 MB and PDF only, and keeps the bucket private", async () => {
    const { rows } = await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'quote-pdfs'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].public).toBe(false);
    expect(Number(rows[0].file_size_limit)).toBe(10 * 1024 * 1024);
    expect(rows[0].allowed_mime_types).toEqual(["application/pdf"]);
  });
});
