#!/usr/bin/env node
/**
 * Applies the schema to whatever DATABASE_URL points at (Supabase, Neon,
 * Render Postgres, local postgres). With no DATABASE_URL it initialises the
 * local sqlite file instead, so `npm run db:setup` always does something useful.
 *
 *   npm run db:setup
 *   npm run db:setup -- --local         # force local sqlite
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const forceLocal = args.includes('--local');

const { pgSchema, sqliteSchema } = await import('../core/db/schema.js');

async function applyPostgres(url) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  await pool.query(pgSchema());
  const row = await pool.query('SELECT COUNT(*)::int AS n FROM candidates');
  await pool.end();
  console.log(`✔ Postgres schema applied. candidates rows: ${row.rows[0].n}`);
  console.log('  (optional) Supabase users: also run db/supabase-hardening.sql to expose only public columns to anon.');
}

async function applySqlite() {
  const file = path.join(root, '.data', 'rank-mitra.sqlite');
  mkdirSync(path.dirname(file), { recursive: true });
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(sqliteSchema());
  const row = db.prepare('SELECT COUNT(*) AS n FROM candidates').get();
  db.close();
  console.log(`✔ local sqlite ready at ${path.relative(root, file)} (candidates rows: ${row.n})`);
}

// allow .env.local / .env to provide DATABASE_URL
try {
  const dotenv = (await import('dotenv')).default;
  for (const f of ['.env.local', '.env']) {
    const p = path.join(root, f);
    if (existsSync(p)) dotenv.config({ path: p, quiet: true });
  }
} catch {}

const url = (process.env.DATABASE_URL || '').trim();
if (forceLocal || !url) {
  if (!forceLocal) console.log('DATABASE_URL not set — using the local sqlite file (dev mode).');
  await applySqlite();
} else {
  await applyPostgres(url);
}
