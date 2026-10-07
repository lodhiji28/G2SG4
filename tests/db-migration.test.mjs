/**
 * Regression test for the additive-column migration path (#36 schema evolution).
 *
 * A deployed database created before `post_preferences` existed must upgrade
 * itself at boot — old rows stay readable, the new column defaults to [] and is
 * writable — otherwise every existing install would 500 on the next release.
 *
 *   node --disable-warning=ExperimentalWarning --import tsx --test tests/db-migration.test.mjs
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'rank-mitra-mig-'));
const file = path.join(dir, 'legacy.sqlite');

/* --- a database in the PRE-migration shape: 29 columns, no post_preferences -- */
const legacy = new DatabaseSync(file);
legacy.exec(`CREATE TABLE candidates (
  id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, roll_number TEXT NOT NULL,
  candidate_name_private TEXT NOT NULL, candidate_name_public TEXT NOT NULL, email TEXT,
  exam_date TEXT, shift_id TEXT, shift_number INTEGER NOT NULL DEFAULT 1,
  total_questions INTEGER NOT NULL DEFAULT 200, attempted INTEGER NOT NULL DEFAULT 0,
  unattempted INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0,
  wrong INTEGER NOT NULL DEFAULT 0, raw_score REAL NOT NULL DEFAULT 0,
  accuracy REAL NOT NULL DEFAULT 0, category TEXT NOT NULL DEFAULT 'UR',
  gender TEXT NOT NULL DEFAULT 'Male', ex_serviceman INTEGER NOT NULL DEFAULT 0,
  contract_status INTEGER NOT NULL DEFAULT 0, qualifications TEXT NOT NULL DEFAULT '[]',
  source_format TEXT, parse_confidence TEXT, file_name TEXT,
  file_bytes INTEGER NOT NULL DEFAULT 0, answer_pattern TEXT, claim_token_hash TEXT,
  submitted_at TEXT, updated_at TEXT
)`);
for (const t of [
  `CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE audit_logs (id TEXT PRIMARY KEY, action TEXT NOT NULL, details TEXT, actor TEXT, ip_hash TEXT, created_at TEXT)`,
  `CREATE TABLE email_log (id TEXT PRIMARY KEY, kind TEXT, to_hash TEXT, status TEXT, error TEXT, created_at TEXT)`,
]) legacy.exec(t);
legacy.exec(
  `INSERT INTO candidates (id,exam_id,roll_number,candidate_name_private,candidate_name_public,shift_number,correct,wrong,attempted,total_questions,raw_score,qualifications)
   VALUES ('c1','mpesb-g2sg4-2026','2600000001','OLD ROW','OLD R****',2,10,2,12,200,9.5,'["CPCT"]')`
);
legacy.close();

const { SqliteDriver } = await import('../core/db/index.js');
const { listCandidates } = await import('../core/repo.js');

const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${err.message.split('\n')[0]}`);
  }
};
const failures = [];

let db;
await check('boot upgrades a legacy file in place (no in-memory fallback)', async () => {
  db = await SqliteDriver.open(file);
  assert.equal(db.inMemory, false, 'driver must not silently fall back to memory');
  const cols = (await db.all("SELECT name FROM pragma_table_info('candidates')")).map((r) => r.name);
  assert.ok(cols.includes('post_preferences'), 'post_preferences must be added at boot');
});

await check('pre-existing rows survive the migration and default to []', async () => {
  const row = await db.get("SELECT roll_number, post_preferences, raw_score FROM candidates WHERE roll_number='2600000001'");
  assert.equal(row.post_preferences, '[]');
  assert.equal(row.raw_score, 9.5);
  const list = await listCandidates(db, { examId: 'mpesb-g2sg4-2026', limit: 10 });
  const c = (list.rows || list)[0];
  assert.deepEqual(c.postPreferences, []);
  assert.deepEqual(c.qualifications, ['CPCT']);
});

await check('the new column is writable and round-trips through the repo', async () => {
  await db.run("UPDATE candidates SET post_preferences = ? WHERE roll_number='2600000001'", ['["001","014"]']);
  const list = await listCandidates(db, { examId: 'mpesb-g2sg4-2026', limit: 10 });
  assert.deepEqual((list.rows || list)[0].postPreferences, ['001', '014']);
});

await check('re-booting an already-migrated file is a no-op (idempotent)', async () => {
  await db.close();
  const again = await SqliteDriver.open(file);
  const cols = (await again.all("SELECT name FROM pragma_table_info('candidates')")).map((r) => r.name);
  assert.equal(cols.filter((c) => c === 'post_preferences').length, 1);
  await again.close();
});

if (db) {
  try {
    await db.close();
  } catch {}
}
rmSync(dir, { recursive: true, force: true });

console.log(`\n${failures.length ? `⚠ ${failures.length} migration check(s) failed` : '✓ ' + 4 + ' migration checks passed'}`);
process.exit(failures.length ? 1 : 0);
