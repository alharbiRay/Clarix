/**
 * Safety interlock for scripts/seed-demo.ts. Seeding must be a deliberate act:
 * - ALLOW_SEED=true is always required;
 * - a local Supabase stack is fine;
 * - a hosted project additionally needs DEMO_SEED_PROJECT_REF set to that
 *   project's exact ref, so a stray .env pointing at production can't be
 *   seeded by accident. (The seed only ever writes rows owned by the demo
 *   account, all flagged is_demo — but it still has to be on purpose.)
 */
export type SeedTarget = { target: "local" } | { target: "remote"; projectRef: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "host.docker.internal"]);

export function assertSeedAllowed(env: Record<string, string | undefined>): SeedTarget {
  if (env.ALLOW_SEED !== "true") {
    throw new Error("Refusing to seed: set ALLOW_SEED=true to confirm you mean it.");
  }
  const raw = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) throw new Error("Refusing to seed: NEXT_PUBLIC_SUPABASE_URL is not set.");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Refusing to seed: NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }

  if (LOCAL_HOSTS.has(url.hostname)) return { target: "local" };

  const match = /^([a-z0-9]{10,40})\.supabase\.co$/.exec(url.hostname);
  if (!match) {
    throw new Error(`Refusing to seed: ${url.hostname} is not a recognised local or Supabase host.`);
  }
  const projectRef = match[1];
  if (!env.DEMO_SEED_PROJECT_REF) {
    throw new Error(
      `Refusing to seed a hosted project. If you really want the demo workspace in ${projectRef}, re-run with DEMO_SEED_PROJECT_REF=${projectRef}.`
    );
  }
  if (env.DEMO_SEED_PROJECT_REF !== projectRef) {
    throw new Error(`Refusing to seed: DEMO_SEED_PROJECT_REF does not match the project in NEXT_PUBLIC_SUPABASE_URL.`);
  }
  return { target: "remote", projectRef };
}
