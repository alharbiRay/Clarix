import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/**
 * In-process Postgres (PGlite) with just enough of Supabase's `auth` and
 * `storage` schemas stubbed for our migrations to apply — used to prove
 * every migration in supabase/migrations applies cleanly in order and to
 * exercise RLS policies, without Docker and without ever touching the real
 * Supabase project.
 */
const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
`;

const GRANTS = `
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public, auth, storage to anon, authenticated, service_role;
grant select, insert on storage.objects to authenticated;
`;

export const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export async function createTestDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
  await db.exec(GRANTS);
  return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Inserts an auth user (the on_auth_user_created trigger creates the profile). */
export async function createUser(db: TestDb, email: string) {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id`,
    [email]
  );
  return rows[0].id;
}

/**
 * Runs `fn` as an authenticated Supabase user — RLS applies — then resets
 * back to the superuser. Mirrors what PostgREST does per request.
 */
export async function asUser<T>(db: TestDb, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set request.jwt.claim.sub = '${userId}'; set request.jwt.claim.role = 'authenticated'; set role authenticated;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;`);
  }
}

/** Runs `fn` as the anon (logged-out) role. */
export async function asAnon<T>(db: TestDb, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role anon;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}
