/**
 * Canonical DDL for both supported storage engines.
 *
 * - `sqlite`  -> Cloudflare D1 (production, free, zero egress billing)
 *                and `node:sqlite` (local dev, Docker, Render file volume)
 * - `postgres`-> Supabase / Neon / Render Postgres / any PG14+
 *
 * Column names and semantics are identical in both dialects so that the SQL in
 * core/repo.js stays portable (only `?` vs `$n` placeholders differ, which the
 * driver fixes automatically).
 *
 * NOTE: `db/schema-d1.sql` and `db/schema-postgres.sql` are generated from this
 * file via `npm run db:sql` — never edit those two by hand.
 */

const CANDIDATES_COLUMNS = /* sql */ `
  id                     TEXT PRIMARY KEY,
  exam_id                TEXT NOT NULL,
  roll_number            TEXT NOT NULL,
  candidate_name_private TEXT NOT NULL,
  candidate_name_public  TEXT NOT NULL,
  email                  TEXT,
  exam_date              TEXT,
  shift_id               TEXT,
  shift_number           INTEGER NOT NULL DEFAULT 1,
  total_questions        INTEGER NOT NULL DEFAULT 200,
  attempted              INTEGER NOT NULL DEFAULT 0,
  unattempted            INTEGER NOT NULL DEFAULT 0,
  correct                INTEGER NOT NULL DEFAULT 0,
  wrong                  INTEGER NOT NULL DEFAULT 0,
  raw_score              REAL    NOT NULL DEFAULT 0,
  accuracy               REAL    NOT NULL DEFAULT 0,
  category               TEXT    NOT NULL DEFAULT 'UR',
  gender                 TEXT    NOT NULL DEFAULT 'Male',
  ex_serviceman          INTEGER NOT NULL DEFAULT 0,
  contract_status        INTEGER NOT NULL DEFAULT 0,
  qualifications         TEXT    NOT NULL DEFAULT '[]',
  post_preferences       TEXT    NOT NULL DEFAULT '[]',
  source_format          TEXT,
  parse_confidence       TEXT,
  file_name              TEXT,
  file_bytes             INTEGER NOT NULL DEFAULT 0,
  answer_pattern         TEXT,
  claim_token_hash       TEXT,
  submitted_at           TEXT,
  updated_at             TEXT
`;

/**
 * `answer_pattern` stores one char per question ('1' correct, '2' wrong,
 * '0' unattempted). 200 questions => 200 bytes. That keeps per-question
 * analytics possible without shipping MBs of raw HTML through the API
 * (this is what blows up free-tier egress).
 */
const INDEXES = /* sql */ `
CREATE UNIQUE INDEX IF NOT EXISTS ux_candidates_exam_roll ON candidates (exam_id, roll_number);
CREATE INDEX IF NOT EXISTS ix_candidates_score  ON candidates (exam_id, raw_score DESC, submitted_at DESC);
CREATE INDEX IF NOT EXISTS ix_candidates_shift  ON candidates (exam_id, shift_number, raw_score DESC);
CREATE INDEX IF NOT EXISTS ix_candidates_cat    ON candidates (exam_id, category, raw_score DESC);
CREATE INDEX IF NOT EXISTS ix_candidates_gender ON candidates (exam_id, gender, raw_score DESC);
CREATE INDEX IF NOT EXISTS ix_candidates_updated ON candidates (updated_at);
CREATE INDEX IF NOT EXISTS ix_audit_created     ON audit_logs (created_at DESC);
`;

export function sqliteSchema() {
  return /* sql */ `
${tableSql('sqlite')}
${INDEXES}
`;
}

export function pgSchema() {
  return /* sql */ `
${tableSql('postgres')}
${INDEXES.replace(/INTEGER NOT NULL DEFAULT 0/g, 'SMALLINT NOT NULL DEFAULT 0')}
${pgMigrations()}
`;
}

function tableSql(dialect) {
  const bool = dialect === 'postgres' ? 'SMALLINT' : 'INTEGER';
  const cols = CANDIDATES_COLUMNS.replace(/ex_serviceman          INTEGER/, 'ex_serviceman          ' + bool)
    .replace(/contract_status        INTEGER/, 'contract_status        ' + bool);
  return /* sql */ `
CREATE TABLE IF NOT EXISTS candidates (
${cols}
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  action     TEXT NOT NULL,
  details    TEXT,
  actor      TEXT,
  ip_hash    TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT
);

CREATE TABLE IF NOT EXISTS email_log (
  id         TEXT PRIMARY KEY,
  kind       TEXT,
  to_hash    TEXT,
  status     TEXT,
  error      TEXT,
  created_at TEXT
);
`;
}

/**
 * Columns added after the first release. `CREATE TABLE IF NOT EXISTS` alone
 * never upgrades an existing database, so every boot (sqlite/D1 driver) checks
 * this list and issues the missing `ALTER TABLE … ADD COLUMN`. Postgres gets
 * the same statements baked into `pgSchema()` because it supports
 * `ADD COLUMN IF NOT EXISTS` (so `npm run db:setup:pg` stays idempotent).
 *
 * Keep the definition compatible with an existing row set: NOT NULL columns must
 * carry a DEFAULT.
 */
export const ADDED_COLUMNS = [
  { name: 'post_preferences', def: "TEXT NOT NULL DEFAULT '[]'" },
];

export function pgMigrations() {
  return ADDED_COLUMNS.map((c) => `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS ${c.name} ${c.def};`).join('\n');
}

/** Statements executed once at boot (safe to re-run). */
export const SCHEMA_VERSION = '2';
