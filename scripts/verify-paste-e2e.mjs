/**
 * End-to-end proof of the ONLY candidate flow, on a throwaway database:
 *
 *   their real saved page → strip to text (what Ctrl+A → copy produces)
 *   → parser → review numbers → POST /api/candidates → rank → second paste of
 *   the same sheet → ALREADY_SAVED → what the public API leaks (nothing)
 *
 * It is deliberately not part of `npm test`: it reads the candidate's own files
 * from samples/real/ (PII, git-ignored) and prints their name, so run it by hand:
 *
 *   npm run verify:paste
 */
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseHTML } from 'linkedom';

if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = class {
    parseFromString(src) {
      return parseHTML(src).document;
    }
  };
}

const dir = mkdtempSync(path.join(tmpdir(), 'rankmitra-e2e-'));
process.env.DB_DRIVER = 'sqlite';
process.env.SQLITE_PATH = path.join(dir, 'e2e.sqlite');
process.env.EMAIL_PROVIDER = 'console';
process.env.LOG_LEVEL = 'error';

const { AnswerKeyParser } = await import('../src/lib/parser/index.ts');
const { calculateRawScore } = await import('../src/lib/scoring/index.ts');
const { createContext, handleRequest } = await import('../core/handler.js');
const ctx = await createContext({ env: process.env });

const call = async (method, p, body, headers = {}) => {
  const res = await handleRequest(
    new Request(`http://e2e.local${p}`, {
      method,
      headers: new Headers({ 'content-type': 'application/json', ...headers }),
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    ctx
  );
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
};

const fileCandidates = [
  path.resolve('samples/real/Response Sheet 1.html'),
  path.resolve('Response Sheet 1.html'),
];
const file = fileCandidates.find((f) => existsSync(f));
let markup;
try {
  if (!file) throw new Error('File not found');
  markup = readFileSync(file, 'utf8');
} catch {
  console.log('  skip  samples/real/Response Sheet 1.html नहीं मिला — यह स्क्रिप्ट असली फ़ाइल पर चलती है।');
  process.exit(0);
}

/* 1 · what the browser hands us when the candidate copies the page */
const pasted = markup
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<\/(?:td|th)>/gi, '\t')
  .replace(/<\/(?:div|p|tr|li|table|h[1-6])>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/\*\*|__|\+\+/g, '')
  .replace(/ {2,}/g, ' ')
  .replace(/\n\s*\n+/g, '\n')
  .trim();

const t0 = Date.now();
const out = new AnswerKeyParser().parse(pasted, 'pasted-from-esb');
const ms = Date.now() - t0;

console.log('\n1 · पेस्ट से पहचान');
console.log(
  `   ${pasted.length.toLocaleString('en-IN')} अक्षर पढ़े → रोल ${out.rollNumber} · ${out.candidateName} · ${out.examDate} · Shift ${out.shiftNumber}`
);
console.log(
  `   सही ${out.correct} · गलत ${out.wrong} · प्रयासित ${out.attempted} · अनुत्तरित ${out.unattempted} · RAW ${out.rawScore} · ${out.confidence} · ${ms} ms`
);
if (out.confidence !== 'VERIFIED') throw new Error('confidence VERIFIED होनी चाहिए थी');
if (ms > 1200) throw new Error(`${ms} ms — बहुत धीमा`);

/* 2 · exactly what the app sends: seven numbers + the three editable fields */
const score = calculateRawScore(out.correct, out.wrong, out.totalQuestions);
const payload = {
  rollNumber: out.rollNumber,
  candidateNamePrivate: out.candidateName,
  examDate: out.examDate,
  shiftNumber: out.shiftNumber,
  totalQuestions: out.totalQuestions,
  correct: score.correct,
  wrong: score.wrong,
  category: 'UR',
  gender: 'Male',
  qualifications: ['स्नातक (Graduation - Any Stream)', 'CPCT (कंप्यूटर दक्षता प्रमाणन - हिंदी/अंग्रेजी)'],
};

const first = await call('POST', '/api/candidates', payload);
console.log('\n2 · सर्वर पर सेव');
console.log(`   HTTP ${first.status} · रैंक #${first.json?.rank?.overallRank}/${first.json?.rank?.totalCandidates} · दावा-टोकन ${first.json?.claimToken ? 'मिला' : 'नहीं'}`);
if (first.status !== 201) throw new Error(`201 आना चाहिए था, ${first.status} आया: ${first.text.slice(0, 200)}`);

const again = await call('POST', '/api/candidates', payload);
console.log(`   वही पेस्ट दोबारा → HTTP ${again.status} · ${again.json?.code}${again.json?.alreadySaved ? ' (अनुकूल सूचना, त्रुटि नहीं)' : ''}`);
if (again.json?.code !== 'ALREADY_SAVED') throw new Error('दोहरी पेस्ट पर ALREADY_SAVED आना चाहिए था');

const conflict = await call('POST', '/api/candidates', { ...payload, correct: 10 });
console.log(`   उलटी गिनती वाले उसी रोल पर → HTTP ${conflict.status} · ${conflict.json?.code}`);
if (conflict.json?.code !== 'DUPLICATE') throw new Error('असली टकराव पर DUPLICATE आना चाहिए था');

/* 3 · what anybody else can see */
const list = await call('GET', '/api/candidates?limit=50');
const row = list.json.candidates[0];
const bytes = new TextEncoder().encode(list.text).length;
console.log('\n3 · सार्वजनिक लिस्ट (कोई भी व्यक्ति यही देखता है)');
console.log(`   ${list.json.total} पंक्ति · पूरी JSON ${bytes} बाइट · नाम "${row.candidateNamePublic}"`);
console.log(`   कंधे से: उत्तर-पैटर्न ${row.answerPattern ? 'मौजूद (गलत!)' : 'नहीं'} · फ़ाइल-नाम ${row.fileName ? row.fileName + ' (गलत!)' : 'नहीं'} · निजी नाम ${row.candidateNamePrivate ? 'मौजूद (गलत!)' : 'नहीं'}`);
for (const bad of ['answerPattern', 'candidateNamePrivate', 'fileName', 'email']) {
  if (row[bad] !== undefined && row[bad] !== null) throw new Error(`सार्वजनिक पंक्ति में ${bad} नहीं होना चाहिए`);
}

const cached = await call('GET', '/api/candidates?limit=50');
console.log(`\n4 · Egress: दूसरा विज़िटर → ${cached.headers.get('x-cache')} · ${cached.headers.get('etag') === list.headers.get('etag') ? 'समान ETag' : 'विभिन्न ETag'}`);
const recond = await call('GET', '/api/candidates?limit=50', undefined, { 'if-none-match': cached.headers.get('etag') });
console.log(`   If-None-Match भेजने पर → HTTP ${recond.status} (${recond.text.length} बाइट)`);

const stats = await call('GET', '/api/stats');
console.log(`   /api/stats → ${new TextEncoder().encode(stats.text).length} बाइट · औसत RAW ${stats.json.summary.avgRawScore} · शिफ्ट ${stats.json.shifts[0].shiftNumber} में ${stats.json.shifts[0].candidateCount} उम्मीदवार`);

console.log('\n✓ पेस्ट → गिनती → रैंक → सार्वजनिक लिस्ट, पूरा रास्ता सही (कोई फ़ाइल कहीं नहीं भेजी/सेव की गई)\n');
await ctx.db.close?.();
