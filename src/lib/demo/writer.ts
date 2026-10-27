import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemoDataset } from "@/lib/demo/dataset";

/** Minimal sink the writer needs — implemented over supabase-js in the seed script, over PGlite in tests. */
export interface DemoSink {
  upsert(table: string, rows: Record<string, unknown>[], conflict: string[], opts?: { ignoreDuplicates?: boolean }): Promise<void>;
  updateProfile(id: string, patch: Record<string, unknown>): Promise<void>;
}

/** Tables in foreign-key order, with the column(s) each upsert keys on. */
export const DEMO_TABLES: { table: keyof DemoDataset; conflict: string[]; ignoreDuplicates?: boolean }[] = [
  { table: "suppliers", conflict: ["id"] },
  { table: "rfqs", conflict: ["id"] },
  { table: "rfq_items", conflict: ["id"] },
  { table: "rfq_suppliers", conflict: ["id"] },
  { table: "quotes", conflict: ["id"] },
  { table: "quote_items", conflict: ["id"] },
  { table: "rfq_preferences", conflict: ["rfq_id"] },
  { table: "ai_recommendations", conflict: ["id"] },
  { table: "rfq_awards", conflict: ["rfq_id"] },
  { table: "notifications", conflict: ["id"] },
  // Append-only (migration 0011): a re-seed must never update an event.
  { table: "audit_events", conflict: ["id"], ignoreDuplicates: true },
];

/**
 * Writes the dataset with upserts on deterministic ids — re-running refreshes
 * the demo (dates move with the clock) without duplicating or deleting
 * anything.
 */
export async function writeDemoDataset(sink: DemoSink, data: DemoDataset) {
  const { id, ...profilePatch } = data.profile;
  await sink.updateProfile(id, profilePatch);
  const counts: Record<string, number> = {};
  for (const { table, conflict, ignoreDuplicates } of DEMO_TABLES) {
    const rows = data[table] as unknown as Record<string, unknown>[];
    if (rows.length > 0) await sink.upsert(table, rows, conflict, { ignoreDuplicates });
    counts[table] = rows.length;
  }
  return counts;
}

export function supabaseSink(admin: SupabaseClient): DemoSink {
  return {
    async upsert(table, rows, conflict, opts) {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await admin
          .from(table)
          .upsert(rows.slice(i, i + 500), { onConflict: conflict.join(","), ignoreDuplicates: opts?.ignoreDuplicates ?? false });
        if (error) throw new Error(`upsert into ${table} failed: ${error.message}`);
      }
    },
    async updateProfile(id, patch) {
      const { error } = await admin.from("profiles").update(patch).eq("id", id);
      if (error) throw new Error(`profile update failed: ${error.message}`);
    },
  };
}
