/**
 * Pluggable data access layer. One tiny driver interface, three engines:
 *
 *   d1        Cloudflare D1 (recommended free prod store - no egress metering)
 *   postgres  Supabase / Neon / any Postgres (uses `pg` when available)
 *   sqlite    local file via node:sqlite (zero-config dev, Docker, Render)
 *
 * Everything speaks the same portable SQL (core/repo.js) with `?`
 * placeholders; the postgres driver rewrites them to `$1, $2, ...`.
 */

import { ADDED_COLUMNS, SCHEMA_VERSION, pgSchema, sqliteSchema } from './schema.js';

/** Indirect dynamic import so Workers/esbuild never try to bundle `pg`. */
const importMaybe = (specifier) => import(/* @vite-ignore */ specifier);

export class SqlError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SqlError';
    this.cause = cause;
  }
}

/**
 * @param {ReturnType<import('../config.js').createConfig>} cfg
 * @param {{ d1?: any }} [bindings] Workers env bindings (D1 database objects)
 */
export async function createDriver(cfg, bindings = {}) {
  const wanted = cfg.dbDriver === 'auto' ? detectDriver(cfg, bindings) : cfg.dbDriver;

  if (wanted === 'd1') {
    const db = bindings[cfg.d1Binding] || bindings[cfg.d1BindingAlt];
    if (!db) {
      throw new SqlError(
        `DB_DRIVER=d1 but no D1 binding "${cfg.d1Binding}" was found. Attach it in wrangler.toml ([d1_databases]) or use bindings.RANK_MITRA_DB.`
      );
    }
    return new D1Driver(db);
  }

  if (wanted === 'postgres') {
    if (!cfg.databaseUrl) throw new SqlError('DB_DRIVER=postgres needs DATABASE_URL (Supabase/Neon pooler connection string).');
    const { default: pg } = await importMaybe('pg').catch(() => {
      throw new SqlError("The 'pg' package is required for Postgres. Run: npm install pg");
    });
    const pool = new pg.Pool({
      connectionString: cfg.databaseUrl.replace(/[?&]sslmode=[^&]+/g, ''),
      ssl: /localhost|127\.0\.0\.1/.test(cfg.databaseUrl) ? false : { rejectUnauthorized: false },
      max: 4,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 15000,
    });
    const driver = new PostgresDriver(pool);
    // Zero manual SQL for the operator: a brand-new Supabase/Neon database is
    // created and migrated the first time the API boots. Every statement in
    // pgSchema() is idempotent (CREATE … IF NOT EXISTS / ADD COLUMN IF NOT
    // EXISTS), so re-deploying is harmless. A failure here is NOT fatal — a
    // read-only role can still serve reads, and the error is reported per
    // statement instead of taking the whole API down.
    try {
      await driver.ensureSchema();
    } catch (e) {
      console.warn('[db] auto-migrate skipped:', e && e.message ? e.message : e);
    }
    return driver;
  }

  if (wanted === 'sqlite') {
    return SqliteDriver.open(cfg.sqlitePath);
  }

  throw new SqlError(`Unknown DB_DRIVER "${wanted}". Use auto | d1 | postgres | sqlite.`);
}

function detectDriver(cfg, bindings) {
  if (bindings[cfg.d1Binding] || bindings[cfg.d1BindingAlt]) return 'd1';
  if (cfg.databaseUrl) return 'postgres';
  return 'sqlite';
}

/* ------------------------------------------------------------------ D1 ---- */

class D1Driver {
  constructor(db) {
    this.db = db;
    this.kind = 'd1';
  }

  async all(sql, params = []) {
    const res = await this.db.prepare(sql).bind(...params).all();
    if (res && res.success === false) throw new SqlError(res.error || 'D1 query failed');
    return res.results || [];
  }

  async get(sql, params = []) {
    const res = await this.db.prepare(sql).bind(...params).first();
    return res || null;
  }

  async run(sql, params = []) {
    const res = await this.db.prepare(sql).bind(...params).run();
    return { changes: res?.meta?.changes ?? 0 };
  }

  async exec() {
    // D1 schema is applied out-of-band with `npm run db:setup:d1`.
    return { skipped: true };
  }

  async close() {}
}

/* -------------------------------------------------------------- Postgres --- */

class PostgresDriver {
  constructor(pool) {
    this.pool = pool;
    this.kind = 'postgres';
  }

  _sql(text) {
    let i = 0;
    return text.replace(/\?/g, () => `$${++i}`);
  }

  _params(params) {
    return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p === undefined ? null : p));
  }

  /** @see SqliteDriver.ensureSchema — same contract, Postgres dialect. */
  async ensureSchema() {
    const { pgSchema, SCHEMA_VERSION } = await import('./schema.js');
    const statements = pgSchema()
      .split(';')
      .map((x) => x.trim())
      .filter((x) => x && !/^--/.test(x));
    for (const stmt of statements) {
      try {
        await this.pool.query(stmt);
      } catch (e) {
        // Privilege errors (role without DDL) must not break serving; a real
        // syntax problem still shows up loudly in the logs.
        console.warn('[db] statement skipped:', String(e && e.message).slice(0, 160));
      }
    }
    try {
      await this.pool.query(
        'INSERT INTO meta (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v',
        ['schema_version', SCHEMA_VERSION]
      );
    } catch {
      /* table may not exist yet if DDL was refused — reads will report that */
    }
  }

  async all(sql, params = []) {
    try {
      const res = await this.pool.query(this._sql(sql), this._params(params));
      return res.rows || [];
    } catch (e) {
      throw new SqlError(e.message, e);
    }
  }

  async get(sql, params = []) {
    const rows = await this.all(sql, params);
    return rows[0] || null;
  }

  async run(sql, params = []) {
    try {
      const res = await this.pool.query(this._sql(sql), this._params(params));
      return { changes: parseInt(res.rowCount ?? '0', 10) };
    } catch (e) {
      throw new SqlError(e.message, e);
    }
  }

  async exec(script) {
    try {
      await this.pool.query(script);
    } catch (e) {
      throw new SqlError(e.message, e);
    }
  }

  async close() {
    await this.pool.end().catch(() => {});
  }
}

/* ---------------------------------------------------------------- SQLite -- */

class SqliteDriver {
  static async open(filePath) {
    const { DatabaseSync } = await importMaybe('node:sqlite');
    let handle;
    let inMemory = false;
    try {
      if (filePath && filePath !== ':memory:') {
        const { mkdirSync } = await import('node:fs');
        const { dirname, resolve } = await import('node:path');
        mkdirSync(dirname(resolve(filePath)), { recursive: true });
      }
      handle = new DatabaseSync(filePath && filePath !== ':memory:' ? filePath : ':memory:');
    } catch {
      handle = new DatabaseSync(':memory:');
      inMemory = true;
    }
    handle.exec('PRAGMA journal_mode = WAL;');
    handle.exec('PRAGMA busy_timeout = 5000;');
    const driver = new SqliteDriver(handle, filePath, inMemory);
    await driver.ensureSchema();
    return driver;
  }

  constructor(handle, filePath, inMemory) {
    this.handle = handle;
    this.kind = 'sqlite';
    this.filePath = filePath;
    this.inMemory = inMemory;
  }

  _clean(params) {
    return params.map((p) => {
      if (typeof p === 'boolean') return p ? 1 : 0;
      if (p === undefined || p === null) return null;
      if (typeof p === 'number') return Number.isFinite(p) ? p : 0;
      return String(p);
    });
  }

  async all(sql, params = []) {
    try {
      return this.handle.prepare(sql).all(...this._clean(params));
    } catch (e) {
      throw new SqlError(e.message, e);
    }
  }

  async get(sql, params = []) {
    const rows = this.handle.prepare(sql).get(...this._clean(params));
    return rows || null;
  }

  async run(sql, params = []) {
    try {
      const res = this.handle.prepare(sql).run(...this._clean(params));
      return { changes: Number(res.changes || 0) };
    } catch (e) {
      throw new SqlError(e.message, e);
    }
  }

  async exec(script) {
    this.handle.exec(script);
  }

  async ensureSchema() {
    await this.exec(sqliteSchema());
    await this.ensureAddedColumns();
    await this.setMeta('schema_version', SCHEMA_VERSION);
  }

  /**
   * Additive migrations for a database that was created before a column existed
   * (the D1 file has the same statements in db/migrations-d1.sql).
   */
  async ensureAddedColumns() {
    let have = null;
    try {
      const rows = await this.all("SELECT name FROM pragma_table_info('candidates')");
      have = new Set((rows || []).map((r) => r.name));
    } catch {
      return; // old SQLite without pragma_table_info: leave the schema as is
    }
    for (const col of ADDED_COLUMNS) {
      if (have.has(col.name)) continue;
      await this.exec(`ALTER TABLE candidates ADD COLUMN ${col.name} ${col.def};`);
    }
  }

  async getMeta(key) {
    const row = await this.get('SELECT v FROM meta WHERE k = ?', [key]);
    return row ? row.v : null;
  }

  async setMeta(key, value) {
    await this.run(
      'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v',
      [key, String(value)]
    );
  }

  async close() {
    try {
      this.handle.close();
    } catch {}
  }
}

export { D1Driver, PostgresDriver, SqliteDriver };
