/**
 * Seeds (or refreshes) the read-only demo workspace behind "Try the demo".
 *
 *   npm run seed:demo -- --dry-run          # print what would be written; touches nothing
 *   ALLOW_SEED=true npm run seed:demo       # local Supabase (supabase start)
 *   ALLOW_SEED=true DEMO_SEED_PROJECT_REF=<ref> npm run seed:demo   # a hosted project, on purpose
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional
 * DEMO_ACCOUNT_EMAIL (default demo@clarix.example). Idempotent: deterministic
 * ids + upserts, so re-running moves the demo's dates up to "now" without
 * duplicating or deleting anything. Only rows owned by the demo account are
 * written. Never logs secrets.
 */
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO_SEED, generateDemoDataset } from "@/lib/demo/dataset";
import { assertSeedAllowed } from "@/lib/demo/seed-guard";
import { supabaseSink, writeDemoDataset } from "@/lib/demo/writer";

const DEFAULT_DEMO_EMAIL = "demo@clarix.example";

function summarize(data: ReturnType<typeof generateDemoDataset>) {
  const stages = data.meta.stages.reduce<Record<string, number>>((acc, s) => {
    acc[s.stage] = (acc[s.stage] ?? 0) + 1;
    return acc;
  }, {});
  return {
    rfqs: data.rfqs.length,
    suppliers: data.suppliers.length,
    quotes: data.quotes.length,
    quote_items: data.quote_items.length,
    recommendations: data.ai_recommendations.length,
    awards: data.rfq_awards.length,
    notifications: data.notifications.length,
    stages,
  };
}

/** Finds or creates the demo auth user. Refuses to take over a real account. */
async function ensureDemoUser(admin: SupabaseClient, email: string): Promise<string> {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, is_demo")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(`profile lookup failed: ${error.message}`);

  if (profile) {
    if (!profile.is_demo) {
      const { count } = await admin
        .from("rfqs")
        .select("id", { count: "exact", head: true })
        .eq("buyer_id", profile.id)
        .eq("is_demo", false);
      if ((count ?? 0) > 0) {
        throw new Error(`${email} belongs to a real account with RFQs — refusing to turn it into the demo account.`);
      }
    }
    return profile.id as string;
  }

  const { data, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    // Random and immediately discarded: the demo is entered via a one-time
    // magic-link token minted server-side (src/app/demo/actions.ts).
    password: randomBytes(32).toString("hex"),
    user_metadata: { full_name: "Demo Buyer" },
  });
  if (createError || !data.user) throw new Error(`could not create demo user: ${createError?.message}`);
  return data.user.id;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    const data = generateDemoDataset({ seed: DEMO_SEED, now: new Date(), buyerId: "00000000-0000-4000-8000-000000000000" });
    console.log(JSON.stringify({ dryRun: true, ...summarize(data) }, null, 2));
    return;
  }

  const target = assertSeedAllowed(process.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = process.env.DEMO_ACCOUNT_EMAIL || DEFAULT_DEMO_EMAIL;
  const buyerId = await ensureDemoUser(admin, email);

  const data = generateDemoDataset({
    seed: DEMO_SEED,
    now: new Date(),
    buyerId,
    tokenSecret: randomBytes(16).toString("hex"),
  });
  await writeDemoDataset(supabaseSink(admin), data);
  console.log(JSON.stringify({ seeded: true, target: target.target, email, ...summarize(data) }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
