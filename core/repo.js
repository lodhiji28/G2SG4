/**
 * Query layer - portable SQL (SQLite/D1 + Postgres share these statements).
 *
 * Design notes tied to the "free tier" problem:
 *  - list endpoints only ever select the PUBLIC columns (no private name, no
 *    e-mail, no per-question data) => ~150 bytes per row instead of ~15 KB.
 *  - every write bumps `meta.rev`; readers send that value back as an ETag and
 *    get a 0-byte `304 Not Modified` when nothing changed.
 */

const PUBLIC_COLS = `
  id, exam_id, roll_number, candidate_name_public, exam_date, shift_id,
  shift_number, total_questions, attempted, unattempted, correct, wrong,
  raw_score, accuracy, category, gender, ex_serviceman, contract_status,
  qualifications, post_preferences, source_format, parse_confidence, submitted_at, updated_at
`;

const PRIVATE_EXTRA = `, candidate_name_private, email, file_name, file_bytes, answer_pattern`;

function rowToCandidate(row, { includePrivate = false } = {}) {
  if (!row) return null;
  const parseArr = (raw) => {
    try {
      const v = JSON.parse(raw || '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const qualifications = parseArr(row.qualifications);
  const base = {
    id: row.id,
    examId: row.exam_id,
    rollNumber: row.roll_number,
    candidateNamePublic: row.candidate_name_public,
    examDate: row.exam_date || '',
    shiftId: row.shift_id || `shift-${String(row.shift_number).padStart(2, '0')}`,
    shiftNumber: Number(row.shift_number || 1),
    totalQuestions: Number(row.total_questions || 200),
    attempted: Number(row.attempted || 0),
    unattempted: Number(row.unattempted || 0),
    correct: Number(row.correct || 0),
    wrong: Number(row.wrong || 0),
    rawScore: Number(row.raw_score || 0),
    accuracy: Number(row.accuracy || 0),
    category: row.category || 'UR',
    gender: row.gender || 'Male',
    exServiceman: !!Number(row.ex_serviceman || 0),
    contractStatus: !!Number(row.contract_status || 0),
    qualifications,
    postPreferences: row.post_preferences === undefined ? [] : parseArr(row.post_preferences),
    sourceFormat: row.source_format || undefined,
    confidence: row.parse_confidence || 'WARNING',
    submittedAt: row.submitted_at || '',
    updatedAt: row.updated_at || undefined,
  };
  if (includePrivate) {
    base.candidateNamePrivate = row.candidate_name_private || '';
    base.email = row.email || '';
    base.fileName = row.file_name || '';
    base.fileBytes = Number(row.file_bytes || 0);
    base.answerPattern = row.answer_pattern || '';
  }
  return base;
}

/* ------------------------------------------------------------ candidates -- */

export async function listCandidates(db, opts = {}) {
  const where = ['exam_id = ?'];
  const params = [opts.examId];

  if (opts.shiftNumber) {
    where.push('shift_number = ?');
    params.push(Number(opts.shiftNumber));
  }
  if (opts.category && opts.category !== 'all') {
    where.push('category = ?');
    params.push(String(opts.category).toUpperCase());
  }
  if (opts.gender && opts.gender !== 'all') {
    where.push('gender = ?');
    params.push(String(opts.gender));
  }
  if (opts.search) {
    where.push('(LOWER(roll_number) LIKE ? OR LOWER(candidate_name_public) LIKE ?)');
    const like = `%${String(opts.search).toLowerCase().replace(/[%_]/g, '')}%`;
    params.push(like, like);
  }
  if (opts.updatedSince) {
    where.push('updated_at > ?');
    params.push(String(opts.updatedSince));
  }

  const order =
    opts.order === 'recent' ? 'submitted_at DESC' : 'raw_score DESC, submitted_at ASC';

  const limit = Math.min(Math.max(Number(opts.limit) || 300, 1), 2000);
  const offset = Math.max(Number(opts.offset) || 0, 0);

  const rows = await db.all(
    `SELECT ${PUBLIC_COLS} FROM candidates WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows.map((r) => rowToCandidate(r));
}

export async function getCandidateByRoll(db, examId, rollNumber, { includePrivate = false } = {}) {
  const cols = includePrivate ? `${PUBLIC_COLS}${PRIVATE_EXTRA}` : PUBLIC_COLS;
  const row = await db.get(
    `SELECT ${cols} FROM candidates WHERE exam_id = ? AND roll_number = ?`,
    [examId, String(rollNumber).toUpperCase()]
  );
  return rowToCandidate(row, { includePrivate });
}

export async function getCandidateById(db, id, { includePrivate = false } = {}) {
  const cols = includePrivate ? `${PUBLIC_COLS}${PRIVATE_EXTRA}` : PUBLIC_COLS;
  const row = await db.get(`SELECT ${cols} FROM candidates WHERE id = ?`, [id]);
  return rowToCandidate(row, { includePrivate });
}

/** @returns {{inserted:boolean, candidate?:any, existing?:any}} */
export async function insertCandidate(db, c, claimTokenHash) {
  const conflict = await db.get('SELECT id FROM candidates WHERE exam_id = ? AND roll_number = ?', [
    c.examId,
    c.rollNumber,
  ]);
  if (conflict) {
    const existing = await getCandidateByRoll(db, c.examId, c.rollNumber, { includePrivate: true });
    return { inserted: false, existing };
  }

  await db.run(
    `INSERT INTO candidates (
      ${PUBLIC_COLS.split(',').map((s) => s.trim()).join(', ')},
      candidate_name_private, email, file_name, file_bytes, answer_pattern, claim_token_hash
    ) VALUES (${new Array(30).fill('?').join(', ')})`,
    [
      c.id,
      c.examId,
      c.rollNumber,
      c.candidateNamePublic,
      c.examDate,
      c.shiftId,
      c.shiftNumber,
      c.totalQuestions,
      c.attempted,
      c.unattempted,
      c.correct,
      c.wrong,
      c.rawScore,
      c.accuracy,
      c.category,
      c.gender,
      c.exServiceman ? 1 : 0,
      c.contractStatus ? 1 : 0,
      JSON.stringify(c.qualifications || []),
      JSON.stringify(Array.isArray(c.postPreferences) ? c.postPreferences.slice(0, 100) : []),
      c.sourceFormat || null,
      c.parseConfidence || null,
      c.submittedAt,
      c.updatedAt,
      // private columns
      c.candidateNamePrivate,
      c.email || null,
      c.fileName || null,
      c.fileBytes || 0,
      c.answerPattern || null,
      claimTokenHash || null,
    ]
  );

  await bumpRevision(db);
  const saved = await getCandidateByRoll(db, c.examId, c.rollNumber, { includePrivate: true });
  return { inserted: true, candidate: saved };
}

/** Profile-only updates (immutable score/shift fields stay untouched). */
export async function updateCandidateProfile(db, examId, rollNumber, fields) {
  const sets = [];
  const params = [];

  if (fields.category) {
    sets.push('category = ?');
    params.push(String(fields.category).toUpperCase());
  }
  if (fields.gender) {
    sets.push('gender = ?');
    params.push(String(fields.gender));
  }
  if (Array.isArray(fields.qualifications)) {
    sets.push('qualifications = ?');
    params.push(JSON.stringify(fields.qualifications.slice(0, 20)));
  }
  if (typeof fields.exServiceman === 'boolean') {
    sets.push('ex_serviceman = ?');
    params.push(fields.exServiceman ? 1 : 0);
  }
  if (typeof fields.contractStatus === 'boolean') {
    sets.push('contract_status = ?');
    params.push(fields.contractStatus ? 1 : 0);
  }
  if (typeof fields.email === 'string') {
    sets.push('email = ?');
    params.push(fields.email.toLowerCase());
  }
  // Post preference list is ordered (index 0 = preference 1) — blueprint #12.
  if (Array.isArray(fields.postPreferences)) {
    const clean = fields.postPreferences
      .map((x) => String(x).trim())
      .filter((x) => /^[0-9]{3}$/.test(x))
      .filter((x, i, a) => a.indexOf(x) === i)
      .slice(0, 100);
    sets.push('post_preferences = ?');
    params.push(JSON.stringify(clean));
  }
  if (!sets.length) return { updated: 0 };

  sets.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(examId, String(rollNumber).toUpperCase());

  const res = await db.run(
    `UPDATE candidates SET ${sets.join(', ')} WHERE exam_id = ? AND roll_number = ?`,
    params
  );
  if (res.changes > 0) await bumpRevision(db);
  return { updated: res.changes };
}

export async function deleteCandidate(db, examId, rollNumber) {
  const res = await db.run('DELETE FROM candidates WHERE exam_id = ? AND roll_number = ?', [
    examId,
    String(rollNumber).toUpperCase(),
  ]);
  if (res.changes > 0) await bumpRevision(db);
  return { deleted: res.changes };
}

export async function clearCandidates(db, examId) {
  const res = await db.run('DELETE FROM candidates WHERE exam_id = ?', [examId]);
  await bumpRevision(db);
  return { deleted: res.changes };
}

export async function countCandidates(db, examId) {
  const row = await db.get('SELECT COUNT(*) AS n FROM candidates WHERE exam_id = ?', [examId]);
  return Number(row?.n || 0);
}

/** Bulk import (admin CSV/JSON). Returns per-row outcome, never throws on dupes. */
export async function bulkUpsert(db, examId, rows, onEach) {
  let inserted = 0;
  let skipped = 0;
  const failed = [];
  for (const row of rows) {
    try {
      const res = await insertCandidate(db, { ...row, examId }, row.claimTokenHash || null);
      if (res.inserted) inserted++;
      else skipped++;
      if (onEach) await onEach(row, res);
    } catch (e) {
      failed.push({ roll: row.rollNumber, error: e.message });
    }
  }
  return { inserted, skipped, failed };
}

/* ----------------------------------------------------------- aggregates --- */

export async function shiftStats(db, examId) {
  if (db.kind === 'postgres') {
    const rows = await db.all(
      `SELECT shift_number,
              COUNT(*)                                                          AS candidate_count,
              AVG(raw_score)                                                    AS avg_raw_score,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY raw_score)           AS median_raw_score,
              AVG(accuracy)                                                     AS avg_accuracy,
              AVG(attempted)                                                    AS avg_attempted,
              AVG(correct)                                                      AS avg_correct,
              AVG(wrong)                                                        AS avg_wrong,
              MAX(raw_score)                                                    AS highest_raw_score,
              MIN(raw_score)                                                    AS lowest_raw_score
         FROM candidates WHERE exam_id = ? GROUP BY shift_number ORDER BY shift_number`,
      [examId]
    );
    return rows.map((r) => ({
      shiftNumber: Number(r.shift_number),
      candidateCount: Number(r.candidate_count || 0),
      avgRawScore: round2(r.avg_raw_score),
      medianRawScore: round2(r.median_raw_score ?? r.avg_raw_score),
      avgAccuracy: round2(r.avg_accuracy),
      avgAttempted: round2(r.avg_attempted),
      avgCorrect: round2(r.avg_correct),
      avgWrong: round2(r.avg_wrong),
      highestRawScore: round2(r.highest_raw_score),
      lowestRawScore: round2(r.lowest_raw_score),
    }));
  }

  const rows = await db.all(
    `SELECT shift_number,
            COUNT(*)        AS candidate_count,
            AVG(raw_score)  AS avg_raw_score,
            AVG(accuracy)   AS avg_accuracy,
            AVG(attempted)  AS avg_attempted,
            AVG(correct)    AS avg_correct,
            AVG(wrong)      AS avg_wrong,
            MAX(raw_score)  AS highest_raw_score,
            MIN(raw_score)  AS lowest_raw_score
       FROM candidates WHERE exam_id = ? GROUP BY shift_number ORDER BY shift_number`,
    [examId]
  );
  const medians = await allScores(db, examId);
  return rows.map((r) => {
    const pool = medians.filter((s) => s.shift_number === Number(r.shift_number)).map((s) => s.raw_score);
    return {
      shiftNumber: Number(r.shift_number),
      candidateCount: Number(r.candidate_count || 0),
      avgRawScore: round2(r.avg_raw_score),
      medianRawScore: round2(median(pool)),
      avgAccuracy: round2(r.avg_accuracy),
      avgAttempted: round2(r.avg_attempted),
      avgCorrect: round2(r.avg_correct),
      avgWrong: round2(r.avg_wrong),
      highestRawScore: round2(r.highest_raw_score),
      lowestRawScore: round2(r.lowest_raw_score),
    };
  });
}

export async function summaryStats(db, examId) {
  const totals = await db.get(
    `SELECT COUNT(*) AS n, AVG(raw_score) AS avg_score, MAX(raw_score) AS top_score,
            AVG(accuracy) AS avg_accuracy, AVG(attempted) AS avg_attempted
       FROM candidates WHERE exam_id = ?`,
    [examId]
  );
  const byCategory = await db.all(
    `SELECT category, COUNT(*) AS n, MAX(raw_score) AS top_score, AVG(raw_score) AS avg_score
       FROM candidates WHERE exam_id = ? GROUP BY category ORDER BY category`,
    [examId]
  );
  const byGender = await db.all(
    `SELECT gender, COUNT(*) AS n, AVG(raw_score) AS avg_score FROM candidates WHERE exam_id = ? GROUP BY gender`,
    [examId]
  );
  const shifts = await db.get(
    `SELECT COUNT(DISTINCT shift_number) AS n FROM candidates WHERE exam_id = ?`,
    [examId]
  );
  const last = await db.get(
    `SELECT MAX(updated_at) AS t FROM candidates WHERE exam_id = ?`,
    [examId]
  );

  // Compute 10 histogram buckets directly in SQL (works identical in SQLite & Postgres):
  const hist = await db.get(
    `SELECT
       SUM(CASE WHEN raw_score > 0   AND raw_score <= 20  THEN 1 ELSE 0 END) AS b0,
       SUM(CASE WHEN raw_score > 20  AND raw_score <= 40  THEN 1 ELSE 0 END) AS b1,
       SUM(CASE WHEN raw_score > 40  AND raw_score <= 60  THEN 1 ELSE 0 END) AS b2,
       SUM(CASE WHEN raw_score > 60  AND raw_score <= 80  THEN 1 ELSE 0 END) AS b3,
       SUM(CASE WHEN raw_score > 80  AND raw_score <= 100 THEN 1 ELSE 0 END) AS b4,
       SUM(CASE WHEN raw_score > 100 AND raw_score <= 120 THEN 1 ELSE 0 END) AS b5,
       SUM(CASE WHEN raw_score > 120 AND raw_score <= 140 THEN 1 ELSE 0 END) AS b6,
       SUM(CASE WHEN raw_score > 140 AND raw_score <= 160 THEN 1 ELSE 0 END) AS b7,
       SUM(CASE WHEN raw_score > 160 AND raw_score <= 180 THEN 1 ELSE 0 END) AS b8,
       SUM(CASE WHEN raw_score > 180 AND raw_score <= 200 THEN 1 ELSE 0 END) AS b9
     FROM candidates WHERE exam_id = ?`,
    [examId]
  );

  const buckets = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200];
  const histogram = buckets.slice(0, -1).map((lo, i) => {
    const hi = buckets[i + 1];
    return { from: lo, to: hi, count: Number(hist?.[`b${i}`] || 0) };
  });

  let medianScore = 0;
  if (db.kind === 'postgres') {
    const medRow = await db.get(
      `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY raw_score) AS med FROM candidates WHERE exam_id = ?`,
      [examId]
    );
    medianScore = round2(medRow?.med ?? totals?.avg_score);
  } else {
    const scores = await allScores(db, examId);
    medianScore = round2(median(scores.map((s) => s.raw_score)));
  }

  return {
    totalCandidates: Number(totals?.n || 0),
    avgRawScore: round2(totals?.avg_score),
    highestRawScore: round2(totals?.top_score),
    avgAccuracy: round2(totals?.avg_accuracy),
    avgAttempted: round2(totals?.avg_attempted),
    activeShifts: Number(shifts?.n || 0),
    lastUpdate: last?.t || null,
    byCategory: byCategory.map((r) => ({
      category: r.category,
      count: Number(r.n),
      topScore: round2(r.top_score),
      avgScore: round2(r.avg_score),
    })),
    byGender: byGender.map((r) => ({ gender: r.gender, count: Number(r.n), avgScore: round2(r.avg_score) })),
    histogram,
    medianRawScore: medianScore,
  };
}

/**
 * Global rank numbers straight from SQL - correct even when the browser only
 * holds one page of the leaderboard.
 */
export async function rankSummary(db, candidate) {
  const { examId, rollNumber, rawScore, category, gender, shiftNumber } = candidate;
  const total = await countCandidates(db, examId);
  if (!total) return null;

  const scoreOf = (col, val) =>
    val
      ? db.get(
          `SELECT
             SUM(CASE WHEN raw_score > ? THEN 1 ELSE 0 END) AS better,
             SUM(CASE WHEN raw_score = ? THEN 1 ELSE 0 END) AS equal,
             COUNT(*) AS n
           FROM candidates WHERE exam_id = ? AND ${col} = ?`,
          [rawScore, rawScore, examId, val]
        )
      : Promise.resolve(null);

  const overall = await db.get(
    `SELECT SUM(CASE WHEN raw_score > ? THEN 1 ELSE 0 END) AS better,
            COUNT(*) AS n
       FROM candidates WHERE exam_id = ?`,
    [rawScore, examId]
  );
  const catRow = await scoreOf('category', category);
  const genderRow = await scoreOf('gender', gender);
  const shiftRow = await scoreOf('shift_number', shiftNumber);

  const rank = (row) => (row ? Number(row.better || 0) + 1 : 1);
  const overallRank = rank(overall);
  const percentile = total > 1 ? (((total - overallRank) / (total - 1)) * 100).toFixed(2) : '100.00';

  return {
    overallRank,
    totalCandidates: total,
    categoryRank: rank(catRow),
    totalCategoryCandidates: Number(catRow?.n || 1),
    genderRank: rank(genderRow),
    totalGenderCandidates: Number(genderRow?.n || 1),
    shiftRank: rank(shiftRow),
    totalShiftCandidates: Number(shiftRow?.n || 1),
    percentile: Number(percentile),
    topPercentage: Number(((overallRank / total) * 100).toFixed(2)),
  };
}

async function allScores(db, examId) {
  return db.all('SELECT shift_number, raw_score FROM candidates WHERE exam_id = ?', [examId]);
}

/* --------------------------------------------------------------- meta ----- */

export async function bumpRevision(db) {
  const cur = await db.get('SELECT v FROM meta WHERE k = ?', ['rev']);
  const next = (parseInt(cur?.v || '0', 10) || 0) + 1;
  await db.run('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v', [
    'rev',
    String(next),
  ]);
  return next;
}

export async function getRevision(db) {
  const row = await db.get('SELECT v FROM meta WHERE k = ?', ['rev']);
  return parseInt(row?.v || '0', 10) || 0;
}

/* --------------------------------------------------------------- audit ---- */

export async function writeAudit(db, entry) {
  await db.run('INSERT INTO audit_logs (id, action, details, actor, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    entry.id,
    entry.action,
    entry.details || '',
    entry.actor || 'system',
    entry.ipHash || '',
    entry.createdAt,
  ]);
}

export async function listAudit(db, limit = 100) {
  const rows = await db.all(
    `SELECT id, action, details, actor, created_at FROM audit_logs ORDER BY created_at DESC LIMIT ?`,
    [Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    details: r.details,
    adminUser: r.actor,
    timestamp: r.created_at,
  }));
}

export async function logEmail(db, entry) {
  await db.run('INSERT INTO email_log (id, kind, to_hash, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    entry.id,
    entry.kind,
    entry.toHash,
    entry.status,
    entry.error || '',
    entry.createdAt,
  ]);
}

/** Emails sent since `sinceIso` - used to enforce a free-tier daily cap. */
export async function countEmailsSince(db, sinceIso) {
  const row = await db.get('SELECT COUNT(*) AS n FROM email_log WHERE created_at > ?', [sinceIso]);
  return Number(row?.n || 0);
}

/* --------------------------------------------------------------- claim ---- */

export async function setClaimToken(db, id, tokenHash) {
  await db.run('UPDATE candidates SET claim_token_hash = ? WHERE id = ?', [tokenHash, id]);
}

export async function getClaimHash(db, id) {
  const row = await db.get('SELECT claim_token_hash, email FROM candidates WHERE id = ?', [id]);
  return row || null;
}

/* -------------------------------------------------------------- helpers --- */

function round2(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export { rowToCandidate, PUBLIC_COLS };
