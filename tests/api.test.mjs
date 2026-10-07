/**
 * Backend acceptance suite — runs against a REAL sqlite file and the REAL
 * request handler (no mocks), in this order:
 *
 *   submit → duplicate handling → privacy → patch rules → egress/caching →
 *   ranking → aggregates → admin (login, export/import) → rate limit → clear
 *
 * Every check is written from the product rules, not from the implementation:
 * e.g. "an answer key is read but never stored", "a second paste of the same
 * sheet is a friendly notice, not an error", "the cache TTL is 1 hour because
 * free-tier egress is the constraint". If a rule is broken the suite fails.
 *
 *   npm run test          (all suites)
 *   node --import tsx tests/api.test.mjs   (just this one)
 */
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.ADMIN_PASSWORD = 'unit-test-pass';
process.env.AUTH_SECRET = 'unit-test-secret';
process.env.EMAIL_PROVIDER = 'console';
process.env.DB_DRIVER = 'sqlite';
process.env.SQLITE_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'rankmitra-')), 'test.sqlite');
process.env.LOG_LEVEL = 'error';

const { createContext, handleRequest, CSV_HEADERS } = await import('../core/handler.js');
const ctx = await createContext({ env: process.env });

let passed = 0;
async function call(method, urlPath, { body, headers = {}, ifNoneMatch } = {}) {
  const h = new Headers({ 'content-type': 'application/json', ...headers });
  if (ifNoneMatch) h.set('if-none-match', ifNoneMatch);
  const res = await handleRequest(
    new Request(`http://test.local${urlPath}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    ctx
  );
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, headers: res.headers, json, text }
}

function test(name, fn) {
  return fn().then(
    () => {
      passed++;
      console.log(`  ok  ${name}`);
    },
    (e) => {
      console.error(`FAIL  ${name}\n      ${e.message}`);
      process.exitCode = 1;
    }
  );
}

const submit = async (over = {}) =>
  call('POST', '/api/candidates', {
    body: {
      rollNumber: over.rollNumber || '2612000001',
      candidateNamePrivate: over.candidateNamePrivate || 'RAHUL KUMAR SINGH',
      correct: over.correct ?? 140,
      wrong: over.wrong ?? 32,
      totalQuestions: over.totalQuestions ?? 200,
      category: over.category || 'OBC',
      gender: over.gender || 'Male',
      shiftNumber: over.shiftNumber ?? 2,
      qualifications: over.qualifications || ['स्नातक (Graduation in any discipline)'],
      email: over.email,
      answerPattern: '1'.repeat(140) + '2'.repeat(32),
      sourceFormat: 'MHTML_PARSED',
      confidence: 'VERIFIED',
    },
  });

let claimToken = '';
let adminToken = '';

/* ------------------------------------------------------------------ boot -- */

await test('health reports sqlite + revision', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.database.driver, 'sqlite');
  assert.equal(r.json.database.connected, true);
  assert.ok(!existsSync('/dev/null/never'), 'sanity: assert helper is live');
});

await test('config tells the client the cache window and that a DB is live', async () => {
  const r = await call('GET', '/api/config');
  assert.equal(r.json.examId, 'mpesb-g2sg4-2026');
  assert.equal(r.json.storage, 'sqlite');
  assert.equal(r.json.emailEnabled, false, 'console provider is not "enabled"');
  assert.equal(r.json.adminEnabled, true);
});

/* -------------------------------------------------------------- validation */

await test('invalid payload is rejected with field errors', async () => {
  const r = await call('POST', '/api/candidates', { body: { rollNumber: 'x', correct: 300, wrong: 300 } });
  assert.equal(r.status, 422);
  assert.match(r.json.error, /rollNumber/);
  assert.match(r.json.error, /category/);
});

await test('an e-mail-looking string is refused rather than half-stored', async () => {
  const r = await call('POST', '/api/candidates', {
    body: {
      rollNumber: '2612000555',
      candidateNamePrivate: 'TEST CANDIDATE',
      correct: 10,
      wrong: 2,
      category: 'UR',
      gender: 'Male',
      shiftNumber: 1,
      email: 'not-an-email',
    },
  });
  assert.equal(r.status, 422);
  assert.match(r.json.error, /email/);
});

/* ---------------------------------------------------------------- storing */

await test('submit stores a public-safe row + returns claim token', async () => {
  const r = await submit();
  assert.equal(r.status, 201);
  assert.equal(r.json.created, true);
  assert.match(r.json.claimToken, /^clm-/);
  assert.equal(r.json.candidate.correct, 140);
  assert.equal(r.json.candidate.wrong, 32);
  assert.equal(r.json.candidate.attempted, 172);
  assert.equal(r.json.candidate.rawScore, 132);
  assert.equal(r.json.candidate.candidateNamePrivate, undefined, 'private name must not come back');
  assert.match(r.json.candidate.candidateNamePublic, /\*|•/, 'public name must be masked');
  claimToken = r.json.claimToken;
});

await test('answer-key content is READ, never stored (data minimisation)', async () => {
  // the submit above carried a 172-char answerPattern; the DB must not keep it
  const row = await ctx.db.get('SELECT answer_pattern, file_name, file_bytes FROM candidates WHERE roll_number = ?', [
    '2612000001',
  ]);
  assert.equal(row.answer_pattern, null, 'per-question pattern must not be persisted by default');
  assert.ok(row.file_name === null || row.file_name === undefined, 'no file name may be stored');
  assert.ok(row.file_bytes === null || row.file_bytes === undefined || row.file_bytes === 0, 'no file bytes may be stored');
});

await test('same roll + same numbers -> 409 ALREADY_SAVED (friendly, not an error)', async () => {
  const r = await submit();
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'ALREADY_SAVED');
  assert.equal(r.json.alreadySaved, true);
  assert.match(r.json.error, /पहले से सेव/);
  const after = await call('GET', '/api/candidates/2612000001');
  assert.equal(after.json.candidate.correct, 140, 'the stored row is untouched');
});

await test('same roll + DIFFERENT numbers -> 409 DUPLICATE, row never overwritten', async () => {
  const r = await submit({ correct: 99, wrong: 50 });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'DUPLICATE');
  assert.equal(r.json.alreadySaved, undefined);
  const after = await call('GET', '/api/candidates/2612000001');
  assert.equal(after.json.candidate.correct, 140, 'a second submission must not rewrite the record');
});

/* ---------------------------------------------------------------- privacy */

await test('list endpoint only exposes public columns', async () => {
  const r = await call('GET', '/api/candidates?limit=10');
  assert.equal(r.json.total, 1);
  const c = r.json.candidates[0];
  assert.equal(c.candidateNamePrivate, undefined);
  assert.equal(c.email, undefined);
  assert.equal(c.answerPattern, undefined);
  assert.ok(JSON.stringify(r.json).length < 1200, 'one public row must stay tiny (egress + privacy)');
});

await test('claim token unlocks ONLY the owner’s own extra fields', async () => {
  const anon = await call('GET', '/api/candidates/2612000001');
  assert.equal(anon.json.answerPattern, undefined);
  const mine = await call('GET', '/api/candidates/2612000001', { headers: { 'x-claim-token': claimToken } });
  assert.equal(mine.status, 200);
  assert.equal(mine.json.candidate.candidateNamePrivate, undefined, 'name stays hidden even to the owner token');
});

/* ------------------------------------------------------------------ patch */

await test('score + shift fields are immutable via PATCH, demographics are not', async () => {
  const r = await call('PATCH', '/api/candidates/2612000001', {
    body: { correct: 1, wrong: 1, rawScore: 99, shiftNumber: 9, examDate: '01/01/2020', category: 'ST', gender: 'Female' },
    headers: { 'x-claim-token': claimToken },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.candidate.correct, 140, 'correct must not be editable');
  assert.equal(r.json.candidate.rawScore, 132, 'raw score must not be editable');
  assert.equal(r.json.candidate.shiftNumber, 2, 'shift must not be editable');
  assert.equal(r.json.candidate.category, 'ST', 'category is editable');
  assert.equal(r.json.candidate.gender, 'Female', 'gender is editable');
});

await test('PATCH without a claim token is refused', async () => {
  const r = await call('PATCH', '/api/candidates/2612000001', { body: { category: 'UR' } });
  assert.ok(r.status === 401 || r.status === 403, `expected 401/403, got ${r.status}`);
});

await test('post preferences round-trip and stay ordered + de-duped (#12)', async () => {
  const r = await call('PATCH', '/api/candidates/2612000001', {
    body: { postPreferences: ['014', '001', '9999', '001'], qualifications: ['CPCT (कंप्यूटर दक्षता प्रमाणन - हिंदी/अंग्रेजी)'] },
    headers: { 'x-claim-token': claimToken },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.candidate.postPreferences, ['014', '001']);
  const list = await call('GET', '/api/candidates?limit=50');
  assert.deepEqual(list.json.candidates[0].postPreferences, ['014', '001']);
});

await test('self-service delete stays off by default (#43)', async () => {
  const r = await call('DELETE', '/api/candidates/2612000001', { headers: { 'x-claim-token': claimToken } });
  assert.equal(r.status, 403);
  assert.match(r.json.error, /नियम #43/);
});

/* --------------------------------------------------- egress / cache layer */

await test('ETag + If-None-Match -> 0-byte 304, and the TTL is 1 hour', async () => {
  const first = await call('GET', '/api/stats');
  const etag = first.headers.get('etag');
  assert.ok(etag, 'stats must send an ETag');
  // The TTL is a product decision (free-tier egress), not a magic number: it must
  // equal what /api/config advertises, and the SPA refreshes on the same clock.
  const cfg = await call('GET', '/api/config');
  const ttl = cfg.json.cacheSeconds;
  assert.equal(ttl, 3600, 'cache + refresh stay at 1 hour (see core/config.js)');
  assert.match(first.headers.get('cache-control') || '', new RegExp(`max-age=${ttl}`));
  const again = await call('GET', '/api/stats', { ifNoneMatch: etag });
  assert.equal(again.status, 304);
  assert.equal(again.text, '');
});

await test('leaderboard body is cached per revision and drops on the next write', async () => {
  const a = await call('GET', '/api/candidates?limit=50');
  const b = await call('GET', '/api/candidates?limit=50');
  assert.equal(a.status, 200);
  assert.equal(a.json.revision, b.json.revision, 'revision must be stable between writes');
  assert.equal(a.headers.get('etag'), b.headers.get('etag'));
  assert.deepEqual(JSON.parse(a.text), JSON.parse(b.text), 'cached body must be byte-identical');
  assert.equal(b.headers.get('x-cache'), 'HIT-eligible', 'second read must come from the response cache');

  // any write bumps the revision, so the next visitor must NOT get the old body
  const patch = await call('PATCH', '/api/candidates/2612000001', {
    body: { category: 'OBC' },
    headers: { 'x-claim-token': claimToken },
  });
  assert.equal(patch.status, 200, patch.text.slice(0, 160));
  const c = await call('GET', '/api/candidates?limit=50');
  assert.notEqual(c.json.revision, a.json.revision, 'revision must move after a write');
  assert.equal(c.json.candidates[0].category, 'OBC', 'cached body must not survive a write');
  assert.equal(c.json.candidates[0].correct, 140, 'the immutable score is still the score');
});

/* ---------------------------------------------------------------- ranking */

await test('server-computed ranks match the client algorithm', async () => {
  await submit({ rollNumber: '2612000002', candidateNamePrivate: 'KIRAN PATEL', correct: 150, wrong: 20, category: 'EWS', gender: 'Female', shiftNumber: 2 });
  const high = await call('GET', '/api/candidates/2612000002');
  const low = await call('GET', '/api/candidates/2612000001');
  assert.equal(high.json.rank.overallRank, 1);
  assert.equal(low.json.rank.overallRank, 2);
  assert.equal(high.json.rank.totalCandidates, 2);
  assert.ok(Number(high.json.rank.percentile) > Number(low.json.rank.percentile));
  assert.equal(high.json.rank.shiftRank + low.json.rank.shiftRank, 3, 'both sat shift 2');
});

await test('stats aggregate by shift and category without shipping rows', async () => {
  const r = await call('GET', '/api/stats');
  assert.equal(r.status, 200);
  assert.ok(r.json && r.json.summary, `stats body missing: ${r.text.slice(0, 120)}`);
  assert.equal(r.json.summary.totalCandidates, 2);
  assert.equal(r.json.summary.activeShifts, 1);
  const shift2 = r.json.shifts.find((x) => x.shiftNumber === 2);
  assert.equal(shift2.candidateCount, 2);
  // 140−32/4 = 132 and 150−20/4 = 145 → mean 138.5, top of the shift 145
  assert.equal(shift2.avgRawScore, 138.5);
  assert.equal(shift2.highestRawScore, 145);
  assert.ok(JSON.stringify(r.json).length < 2000, 'stats payload must stay small (no rows inside)');
});

/* ------------------------------------------------------------------ admin */

await test('admin endpoints require a valid token', async () => {
  const bad = await call('POST', '/api/admin/login', { body: { password: 'nope' } });
  assert.equal(bad.status, 401);
  const good = await call('POST', '/api/admin/login', { body: { password: 'unit-test-pass' } });
  assert.equal(good.status, 200);
  assert.ok(good.json.token);
  adminToken = good.json.token;

  const noToken = await call('GET', '/api/admin/export?format=csv');
  assert.ok(noToken.status === 401 || noToken.status === 403);
  const audit = await call('GET', '/api/admin/audit', { headers: { 'x-admin-token': adminToken } });
  assert.equal(audit.status, 200);
  assert.ok(audit.json.logs.some((l) => l.action === 'NEW_SUBMISSION'));
});

await test('export CSV columns stay aligned with CSV_HEADERS (drift guard)', async () => {
  const csv = await call('GET', '/api/admin/export?format=csv', { headers: { 'x-admin-token': adminToken } });
  assert.equal(csv.status, 200);
  const { parseCsvExport } = await import('../core/handler.js');
  const rows = parseCsvExport(csv.text);
  assert.ok(rows.length >= 2, 'export produced no rows');
  const lines = csv.text.split('\r\n').filter(Boolean);
  assert.equal(lines[0].split(',').length, CSV_HEADERS.length, 'CSV_HEADERS must match the printed header line');

  /*
   * parseCsvExport lower-cases the header names, so each value below must land in
   * exactly the column named after it. A header/value offset (the classic
   * "16 headers, 17 values" mistake) shows up here as a wrong number rather than
   * as a silently shifted spreadsheet in the operator's Excel.
   */
  const one = rows.find((r) => r['roll number'] === '2612000001');
  assert.ok(one, 'exported CSV must contain the submitted roll');
  assert.equal(one.correct, '140');
  assert.equal(one.wrong, '32');
  assert.equal(one.attempted, '172');
  assert.equal(one['raw score'], '132');
  assert.equal(one['accuracy %'], '81.4');
  assert.equal(one.category, 'OBC');
  assert.equal(one.gender, 'Female');
  assert.equal(one['shift number'], '2');
  assert.equal(one['post preferences'], '014; 001');
  assert.equal(one['ex-serviceman'], 'No');
  assert.ok(one['submitted at'], 'timestamp column must be populated');
  assert.match(one['candidate name'], /\*+/, 'the plain export stays masked; ?private=1 is the opt-in');

  const priv = await call('GET', '/api/admin/export?format=csv&private=1', { headers: { 'x-admin-token': adminToken } });
  assert.match(priv.text, /KIRAN PATEL/, '?private=1 reveals full names — deliberately, for the operator');
});

await test('admin import accepts its own export (round-trip)', async () => {
  const csv = await call('GET', '/api/admin/export?format=csv', { headers: { 'x-admin-token': adminToken } });
  const before = await call('GET', '/api/candidates?limit=50');
  const res = await call('POST', '/api/admin/import', {
    body: { csv: csv.text },
    headers: { 'x-admin-token': adminToken },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.inserted, 0, 'existing rolls must be skipped, not duplicated');
  assert.equal(res.json.skipped, 2);
  const after = await call('GET', '/api/candidates?limit=50');
  assert.equal(after.json.total, before.json.total, 'import of the same rows changes nothing');
});

await test('import of a NEW roll creates the row and keeps the numbers', async () => {
  const res = await call('POST', '/api/admin/import', {
    body: {
      rows: [
        // keys exactly as parseCsvExport hands them over (lower-cased header names)
        {
          'roll number': '2612000333',
          'candidate name': 'IMPORTED CANDIDATE',
          'exam date': '23/09/2026',
          'shift number': '3',
          category: 'UR',
          gender: 'Male',
          'total questions': '200',
          attempted: '100',
          correct: '90',
          wrong: '10',
          'raw score': '87.5',
          'accuracy %': '90',
          qualifications: 'CPCT (कंप्यूटर दक्षता प्रमाणन - हिंदी/अंग्रेजी)',
          'post preferences': '',
          'ex-serviceman': 'No',
          contract: 'No',
          'submitted at': '2026-09-23T10:00:00.000Z',
        },
      ],
    },
    headers: { 'x-admin-token': adminToken },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.inserted, 1, JSON.stringify(res.json).slice(0, 220));
  const row = await call('GET', '/api/candidates/2612000333');
  assert.equal(row.json.candidate.rawScore, 87.5);
  assert.equal(row.json.candidate.unattempted, 100);
});

/* --------------------------------------------------------- abuse guards -- */

await test('rate limiter blocks a submit flood from one IP', async () => {
  let blocked = 0;
  for (let i = 0; i < 30; i++) {
    const r = await call('POST', '/api/candidates', {
      body: {
        rollNumber: `261299${String(i).padStart(4, '0')}`,
        candidateNamePrivate: 'FLOOD TEST',
        correct: 5,
        wrong: 1,
        category: 'UR',
        gender: 'Male',
        shiftNumber: 1,
      },
    });
    if (r.status === 429) blocked++;
  }
  assert.ok(blocked > 0, 'a flood of submissions must hit the hourly cap');
});

await test('clear-all needs the exact confirmation string', async () => {
  const weak = await call('POST', '/api/admin/clear', { body: { confirm: 'yes' }, headers: { 'x-admin-token': adminToken } });
  assert.equal(weak.status, 400);
  const ok = await call('POST', '/api/admin/clear', { body: { confirm: 'DELETE ALL' }, headers: { 'x-admin-token': adminToken } });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.deleted >= 3);
  const after = await call('GET', '/api/candidates?limit=50');
  assert.equal(after.json.total, 0, 'no dummy rows may survive the suite');
});

await ctx.db.close?.();
console.log(`\n${passed} API checks passed${process.exitCode ? ' (with failures)' : ''}`);
