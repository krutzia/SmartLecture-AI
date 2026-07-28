const DB_PREFIX = "sl_db_";

// ---------------------------------------------------------------------------
// In-memory + localStorage store
// ---------------------------------------------------------------------------

function loadTable(name: string): Record<string, any>[] {
  try {
    const raw = localStorage.getItem(DB_PREFIX + name);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTable(name: string, rows: Record<string, any>[]) {
  localStorage.setItem(DB_PREFIX + name, JSON.stringify(rows));
}

// ---------------------------------------------------------------------------
// Pub/Sub for realtime channel emulation
// ---------------------------------------------------------------------------

type ChangePayload = {
  event: "INSERT" | "UPDATE" | "DELETE" | "*";
  schema: string;
  table: string;
  filter?: string;
  new?: Record<string, any>;
  old?: Record<string, any>;
};

type ChangeCallback = (payload: ChangePayload) => void;

const listeners: { table: string; cb: ChangeCallback }[] = [];

function notify(table: string, event: string, row?: Record<string, any>, old?: Record<string, any>) {
  listeners.forEach((l) => {
    if (l.table === table || l.table === "*") {
      l.cb({ event: event as any, schema: "public", table, new: row, old });
    }
  });
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function pickCols(row: Record<string, any>, cols: string | null): Record<string, any> {
  if (!cols) return row;
  const fields = cols.split(",").map((c) => c.trim());
  const out: Record<string, any> = {};
  for (const f of fields) {
    if (f === "*") return row;
    if (f in row) out[f] = row[f];
  }
  return out;
}

function matchesFilter(row: Record<string, any>, filters: [string, string, any][]): boolean {
  return filters.every(([col, op, val]) => {
    const rv = row[col];
    switch (op) {
      case "eq": return rv === val || (rv == null && val == null);
      case "lte": return rv <= val;
      case "gte": return rv >= val;
      case "in": return Array.isArray(val) && val.includes(rv);
      default: return true;
    }
  });
}

function runQuery(
  tableName: string,
  cols: string | null,
  filters: [string, string, any][],
  opts: { count?: string; head?: boolean; order?: { col: string; asc: boolean }; limit?: number },
): { data: any; count: number | null } {
  let rows = loadTable(tableName);
  rows = rows.filter((r) => matchesFilter(r, filters));
  const count = rows.length;
  if (opts.order) {
    const { col, asc } = opts.order;
    rows.sort((a, b) => {
      const av = a[col], bv = b[col];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });
  }
  if (opts.limit != null) rows = rows.slice(0, opts.limit);
  if (opts.head) return { data: null, count };
  return { data: rows.map((r) => pickCols(r, cols)), count };
}

// ---------------------------------------------------------------------------
// Result wrapper
// ---------------------------------------------------------------------------

type SBResult<T = any> = { data: T | null; error: any | null; count?: number | null };

class QueryResult<T = any> {
  _data: T | null = null;
  _error: any | null = null;
  _count: number | null = null;

  get data() { return this._data; }
  get error() { return this._error; }
  get count() { return this._count; }

  maybeSingle(): SBResult<T> {
    if (this._error) return { data: null, error: this._error };
    const arr = Array.isArray(this._data) ? this._data : this._data ? [this._data] : [];
    return { data: (arr[0] as T) ?? null, error: null };
  }

  single(): SBResult<T> {
    const r = this.maybeSingle();
    if (r.error) return r;
    if (!r.data) return { data: null, error: { message: "Row not found", code: "PGRST116" } };
    return r;
  }

  select(_cols?: string): { then: (resolve: (r: SBResult) => void) => void; maybeSingle: () => SBResult; single: () => SBResult } {
    const self = this;
    return {
      then(resolve: (r: SBResult) => void) {
        resolve({ data: self._data, error: null, count: self._count });
      },
      maybeSingle() { return self.maybeSingle(); },
      single() { return self.single(); },
    };
  }
}

// ---------------------------------------------------------------------------
// TableRef: .from("table").select().eq().order()…
// ---------------------------------------------------------------------------

class TableRef {
  constructor(private _table: string) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }): QueryBuilder {
    return new QueryBuilder(this._table, cols ?? null, opts);
  }

  insert(rows: any): QueryResult {
    const table = loadTable(this._table);
    const items = Array.isArray(rows) ? rows : [rows];
    const inserted: Record<string, any>[] = [];
    for (const item of items) {
      const row: Record<string, any> = { id: item.id ?? crypto.randomUUID(), created_at: item.created_at ?? new Date().toISOString(), ...item };
      table.push(row);
      inserted.push(row);
      notify(this._table, "INSERT", row);
    }
    saveTable(this._table, table);
    const res = new QueryResult();
    res._data = Array.isArray(rows) ? inserted : inserted[0] ?? null;
    return res;
  }

  update(data: Record<string, any>): UpdateBuilder {
    return new UpdateBuilder(this._table, data);
  }

  delete(): DeleteBuilder {
    return new DeleteBuilder(this._table);
  }
}

// ---------------------------------------------------------------------------
// QueryBuilder: .select().eq().lte().gte().in().order().limit()
// ---------------------------------------------------------------------------

class QueryBuilder extends QueryResult {
  private _table: string;
  private _cols: string | null;
  private _filters: [string, string, any][] = [];
  private _opts: { count?: string; head?: boolean; order?: { col: string; asc: boolean }; limit?: number } = {};

  constructor(table: string, cols: string | null, opts?: { count?: string; head?: boolean }) {
    super();
    this._table = table;
    this._cols = cols;
    if (opts) {
      if (opts.count) this._opts.count = opts.count;
      if (opts.head) this._opts.head = opts.head;
    }
  }

  eq(col: string, val: any): this { this._filters.push([col, "eq", val]); return this; }
  lte(col: string, val: any): this { this._filters.push([col, "lte", val]); return this; }
  gte(col: string, val: any): this { this._filters.push([col, "gte", val]); return this; }
  in(col: string, vals: any[]): this { this._filters.push([col, "in", vals]); return this; }

  order(col: string, opts?: { ascending?: boolean }): this {
    this._opts.order = { col, asc: opts?.ascending !== false };
    return this;
  }

  limit(n: number): this { this._opts.limit = n; return this; }

  then(resolve: (r: SBResult) => void) {
    const { data, count } = runQuery(this._table, this._cols, this._filters, this._opts);
    this._data = data;
    this._count = count;
    resolve({ data: this._data, error: null, count: this._count });
  }

  maybeSingle(): SBResult & PromiseLike<SBResult> {
    const self = this;
    const exec = () => {
      const { data, count } = runQuery(self._table, self._cols, self._filters, self._opts);
      self._data = data;
      self._count = count;
      const arr = Array.isArray(data) ? data : data ? [data] : [];
      return { data: (arr[0] as any) ?? null, error: null, count } as SBResult;
    };
    const cached = { exec: exec as () => SBResult, result: undefined as SBResult | undefined };
    const getResult = () => { if (!cached.result) cached.result = cached.exec(); return cached.result; };
    return {
      get data() { return getResult().data; },
      get error() { return getResult().error; },
      get count() { return getResult().count; },
      then(resolve: (r: SBResult) => void) { resolve(getResult()); },
    };
  }

  single(): SBResult & PromiseLike<SBResult> {
    const self = this;
    const exec = () => {
      const { data, count } = runQuery(self._table, self._cols, self._filters, self._opts);
      self._data = data;
      self._count = count;
      const arr = Array.isArray(data) ? data : data ? [data] : [];
      if (arr.length === 0) return { data: null, error: { message: "Row not found", code: "PGRST116" }, count } as SBResult;
      return { data: arr[0], error: null, count } as SBResult;
    };
    const cached = { exec: exec as () => SBResult, result: undefined as SBResult | undefined };
    const getResult = () => { if (!cached.result) cached.result = cached.exec(); return cached.result; };
    return {
      get data() { return getResult().data; },
      get error() { return getResult().error; },
      get count() { return getResult().count; },
      then(resolve: (r: SBResult) => void) { resolve(getResult()); },
    };
  }
}

// ---------------------------------------------------------------------------
// UpdateBuilder: .update().eq()
// ---------------------------------------------------------------------------

class UpdateBuilder extends QueryResult {
  private _table: string;
  private _data: Record<string, any>;
  private _filters: [string, string, any][] = [];

  constructor(table: string, data: Record<string, any>) {
    super();
    this._table = table;
    this._data = data;
  }

  eq(col: string, val: any): this { this._filters.push([col, "eq", val]); return this; }

  then(resolve: (r: SBResult) => void) {
    const table = loadTable(this._table);
    let count = 0;
    for (let i = 0; i < table.length; i++) {
      if (matchesFilter(table[i], this._filters)) {
        const old = { ...table[i] };
        Object.assign(table[i], this._data);
        notify(this._table, "UPDATE", table[i], old);
        count++;
      }
    }
    saveTable(this._table, table);
    this._data = { updated: count } as any;
    resolve({ data: this._data, error: null });
  }
}

// ---------------------------------------------------------------------------
// DeleteBuilder: .delete().eq()
// ---------------------------------------------------------------------------

class DeleteBuilder extends QueryResult {
  private _table: string;
  private _filters: [string, string, any][] = [];

  constructor(table: string) {
    super();
    this._table = table;
  }

  eq(col: string, val: any): this { this._filters.push([col, "eq", val]); return this; }

  then(resolve: (r: SBResult) => void) {
    const table = loadTable(this._table);
    const remaining: Record<string, any>[] = [];
    for (const row of table) {
      if (matchesFilter(row, this._filters)) {
        notify(this._table, "DELETE", row);
      } else {
        remaining.push(row);
      }
    }
    saveTable(this._table, remaining);
    resolve({ data: null, error: null });
  }
}

// ---------------------------------------------------------------------------
// Channel (Realtime emulation)
// ---------------------------------------------------------------------------

class Channel {
  private _subs: { table: string; event: string; cb: ChangeCallback }[] = [];
  private _subscribed = false;

  on(
    _event: string,
    opts: { schema?: string; table?: string; filter?: string },
    cb: ChangeCallback,
  ): this {
    const table = opts.table ?? "*";
    this._subs.push({ table, event: opts.schema ?? _event, cb });
    return this;
  }

  subscribe(): this {
    for (const s of this._subs) {
      listeners.push({ table: s.table, cb: s.cb });
    }
    this._subscribed = true;
    return this;
  }

  unsubscribe() {
    if (!this._subscribed) return;
    for (const s of this._subs) {
      const idx = listeners.findIndex((l) => l.cb === s.cb);
      if (idx !== -1) listeners.splice(idx, 1);
    }
    this._subscribed = false;
  }
}

// ---------------------------------------------------------------------------
// Edge Functions (invoke locally or via /api routes)
// ---------------------------------------------------------------------------

async function loadTranscriptText(lectureId: string): Promise<string> {
  const table = loadTable("transcripts");
  const row = table.find((r: any) => r.lecture_id === lectureId);
  return row?.full_text ?? "";
}

async function invokeFunction(name: string, opts?: { body?: any }): Promise<SBResult> {
  const body = opts?.body ?? {};

  try {
    const transcript = await loadTranscriptText(body.lectureId ?? "");

    if (name === "process-lecture") {
      const { processLectureLocally } = await import("./processLecture");
      processLectureLocally(body.lectureId, body.userId).catch((e) =>
        console.error("processLectureLocally failed:", e),
      );
      return { data: { started: true }, error: null };
    }

    if (name === "generate-quiz") {
      try {
        const resp = await fetch("/api/generate-quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ ...body, transcript }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "Quiz generation failed" }));
          throw new Error(err.error ?? "Quiz generation failed");
        }
        const data = await resp.json();
        return { data, error: null };
      } catch (e: any) {
        const { generateQuizLocally } = await import("./processLecture");
        const result = await generateQuizLocally(body.lectureId, body.userId, body.numQuestions ?? 8, body.focusTopic);
        return { data: result, error: null };
      }
    }

    if (name === "cluster-concepts") {
      try {
        const conceptTable = loadTable("concepts");
        const concepts = conceptTable.filter((c: any) => c.lecture_id === body.lectureId);
        const resp = await fetch("/api/cluster-concepts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ lectureId: body.lectureId, concepts }),
        });
        if (!resp.ok) throw new Error("Clustering failed");
        const { clusters } = await resp.json();
        if (Array.isArray(clusters)) {
          for (const cluster of clusters) {
            for (const id of cluster.conceptIds ?? []) {
              await supabase.from("concepts").update({ cluster: cluster.name }).eq("id", id);
            }
          }
        }
        return { data: { ok: true }, error: null };
      } catch (e: any) {
        const { clusterConceptsLocally } = await import("./processLecture");
        await clusterConceptsLocally(body.lectureId);
        return { data: { ok: true }, error: null };
      }
    }
  } catch (e: any) {
    return { data: null, error: { message: e?.message ?? "Function invoke failed" } };
  }

  return { data: null, error: { message: `Unknown function: ${name}` } };
}

// ---------------------------------------------------------------------------
// Storage (local file cache — no remote storage)
// ---------------------------------------------------------------------------

class BucketRef {
  async upload(
    path: string,
    file: File | Blob,
    _opts?: { contentType?: string; upsert?: boolean },
  ): Promise<SBResult> {
    // Store file as data URL in localStorage
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const key = DB_PREFIX + "storage_" + path;
        localStorage.setItem(key, reader.result as string);
        resolve({ data: { path }, error: null });
      };
      reader.onerror = () => resolve({ data: null, error: { message: "File read failed" } });
      reader.readAsDataURL(file);
    });
  }
}

class StorageRef {
  from(bucket: string): BucketRef {
    return new BucketRef();
  }
}

// ---------------------------------------------------------------------------
// Main client export
// ---------------------------------------------------------------------------

export const supabase = {
  from(table: string): TableRef {
    return new TableRef(table);
  },

  channel(name: string): Channel {
    return new Channel();
  },

  removeChannel(ch: Channel) {
    ch.unsubscribe();
  },

  functions: {
    async invoke(name: string, opts?: { body?: any }): Promise<SBResult> {
      return invokeFunction(name, opts);
    },
  },

  storage: new StorageRef(),
};
