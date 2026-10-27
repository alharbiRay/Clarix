/**
 * Minimal in-memory stand-in for the subset of the supabase-js query builder
 * our server code uses: from().select/insert/update/upsert/delete with
 * eq/neq/is/in/order/limit filters, single()/maybeSingle(), and rpc().
 *
 * Column lists and embedded relations in select() are ignored (full rows are
 * returned) — tests seed rows in the shape the code expects. Unique
 * constraints are declared per table and produce the same `23505` error code
 * PostgREST returns, which is what the idempotency logic keys off.
 */
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export interface FakeTableOptions {
  /** Like PostgREST's max-rows: cap on rows returned per request. */
  maxRows?: number;
  /** Column sets that must be unique, e.g. [["rfq_id"]]. */
  unique?: string[][];
  /** Optional partial-unique predicate: only rows matching it count toward uniqueness. */
  uniqueWhere?: (row: Row) => boolean;
}

export interface FakeSupabase {
  tables: Record<string, Row[]>;
  from(table: string): QueryBuilder;
  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  rpcHandlers: Record<string, (args: Record<string, unknown>) => unknown>;
  storage: { from(bucket: string): { upload: () => Promise<{ error: null }>; remove: () => Promise<{ error: null }> } };
}

let idCounter = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++idCounter).padStart(12, "0")}`;

class QueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private returning = false;
  private singleMode: "single" | "maybeSingle" | null = null;
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private upsertConflict: string[] | null = null;

  constructor(
    private db: FakeSupabase,
    private table: string,
    private options: FakeTableOptions
  ) {}

  /** Column lists are ignored; after a write, select() means "return the rows". */
  select() {
    if (this.op !== "select") this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.upsertConflict = opts?.onConflict?.split(",") ?? this.options.unique?.[0] ?? ["id"];
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  neq(col: string, value: unknown) {
    this.filters.push((r) => r[col] !== value);
    return this;
  }
  is(col: string, value: unknown) {
    this.filters.push((r) => (r[col] ?? null) === value);
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  gte(col: string, value: unknown) {
    this.filters.push((r) => String(r[col]) >= String(value));
    return this;
  }
  lte(col: string, value: unknown) {
    this.filters.push((r) => String(r[col]) <= String(value));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this;
  }

  private rows() {
    return (this.db.tables[this.table] ??= []);
  }

  private violatesUnique(candidate: Row, ignore?: Row) {
    const { unique = [], uniqueWhere } = this.options;
    if (uniqueWhere && !uniqueWhere(candidate)) return false;
    return unique.some((cols) =>
      this.rows().some(
        (existing) =>
          existing !== ignore &&
          (!uniqueWhere || uniqueWhere(existing)) &&
          cols.every((c) => existing[c] === candidate[c])
      )
    );
  }

  private finish(rows: Row[]) {
    let out = rows;
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    if (this.rangeFrom !== null) out = out.slice(this.rangeFrom, (this.rangeTo ?? out.length - 1) + 1);
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    if (this.options.maxRows !== undefined) out = out.slice(0, this.options.maxRows);
    if (this.singleMode) {
      if (out.length === 0) {
        return this.singleMode === "single"
          ? { data: null, error: { code: "PGRST116", message: "no rows" } }
          : { data: null, error: null };
      }
      return { data: { ...out[0] }, error: null };
    }
    return { data: out.map((r) => ({ ...r })), error: null };
  }

  private execute(): { data: unknown; error: unknown } {
    const matches = () => this.rows().filter((r) => this.filters.every((f) => f(r)));
    switch (this.op) {
      case "select":
        return this.finish(matches());
      case "insert": {
        const created: Row[] = [];
        for (const raw of this.payload) {
          const row = { id: nextId(), created_at: new Date().toISOString(), ...raw };
          if (this.violatesUnique(row)) {
            return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${this.table}` } };
          }
          this.rows().push(row);
          created.push(row);
        }
        return this.returning || this.singleMode ? this.finish(created) : { data: null, error: null };
      }
      case "upsert": {
        const out: Row[] = [];
        for (const raw of this.payload) {
          const existing = this.rows().find((r) => this.upsertConflict!.every((c) => r[c] === raw[c]));
          if (existing) {
            Object.assign(existing, raw);
            out.push(existing);
          } else {
            const row = { id: nextId(), ...raw };
            this.rows().push(row);
            out.push(row);
          }
        }
        return this.returning || this.singleMode ? this.finish(out) : { data: null, error: null };
      }
      case "update": {
        const hit = matches();
        for (const r of hit) Object.assign(r, this.patch);
        return this.returning || this.singleMode ? this.finish(hit) : { data: null, error: null };
      }
      case "delete": {
        const hit = new Set(matches());
        this.db.tables[this.table] = this.rows().filter((r) => !hit.has(r));
        return { data: null, error: null };
      }
    }
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }
}

export function createFakeSupabase(
  seed: Record<string, Row[]> = {},
  tableOptions: Record<string, FakeTableOptions> = {}
): FakeSupabase {
  const db: FakeSupabase = {
    tables: Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))])),
    rpcHandlers: {},
    from(table: string) {
      return new QueryBuilder(db, table, tableOptions[table] ?? {});
    },
    async rpc(fn: string, args: Record<string, unknown> = {}) {
      const handler = db.rpcHandlers[fn];
      if (!handler) return { data: null, error: { message: `no rpc ${fn}` } };
      return { data: await handler(args), error: null };
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => ({ error: null }),
      }),
    },
  };
  return db;
}
