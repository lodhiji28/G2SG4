-- ===========================================================================
--  Rank Mitra — Supabase / Postgres hardening (optional but recommended)
-- ===========================================================================
--  Run this AFTER db/schema-pg.sql, in the Supabase SQL editor.
--
--  Why: the previous deployment was paused for exceeding free-tier
--  *origin egress* (13.1 GB / 5 GB), not storage. The two things that actually
--  move that number are (a) serving app/file downloads out of Supabase and
--  (b) SELECTing whole tables (raw HTML, per-question arrays) on every page
--  load. This file makes the second one structurally impossible for anon keys:
--  the browser-facing role only ever sees the 23 public columns.
--
--  The Node/Worker API connects with DATABASE_URL (table owner), so it is not
--  affected by these grants; it already selects the public column list and
--  answers unchanged reads with a 0-byte `304 Not Modified`.
-- ---------------------------------------------------------------------------

-- 1) Public projection: no candidate name, no e-mail, no answer pattern.
CREATE OR REPLACE VIEW candidates_public AS
SELECT id, exam_id, roll_number, candidate_name_public, exam_date, shift_id,
       shift_number, total_questions, attempted, unattempted, correct, wrong,
       raw_score, accuracy, category, gender, ex_serviceman, contract_status,
       qualifications, source_format, parse_confidence, submitted_at, updated_at
FROM candidates;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON candidates_public TO anon, authenticated;

-- Deny anon/authenticated any direct table access. Writes must go through the
-- API (which validates, rate-limits and enforces UNIQUE(exam_id, roll_number)).
REVOKE ALL ON candidates        FROM anon, authenticated;
REVOKE ALL ON audit_logs        FROM anon, authenticated;
REVOKE ALL ON email_log         FROM anon, authenticated;
REVOKE ALL ON meta              FROM anon, authenticated;

-- 2) Row level security as a belt-and-braces layer on the view.
ALTER VIEW candidates_public SET (security_barrier = true);
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no anon writes" ON candidates;
CREATE POLICY "no anon writes" ON candidates
  FOR INSERT TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 3) Keep the free 500 MB budget safe: cap the audit tables, prune monthly.
--    (Supabase: install pg_cron from Database -> Extensions, then run:)
--
-- SELECT cron.schedule('rank-mitra-retention', '20 18 * * *', $$
--   DELETE FROM audit_logs WHERE created_at < now() - interval '120 days';
--   DELETE FROM email_log  WHERE created_at < now() - interval '30 days';
-- $$);

-- 4) Do NOT store uploaded answer-key files in Supabase Storage.
--    A single 3 MB .mhtml downloaded 1,700 times is 5 GB of egress on its own.
--    The parser never needs the file after parsing: the DB keeps only the
--    derived numbers plus a 200-byte `answer_pattern`. Delete any bucket you
--    created for uploads:
--
--    DROP POLICY IF EXISTS "public read keys" ON storage.objects;
--    (or Storage -> Buckets -> answer-keys -> Delete bucket)
