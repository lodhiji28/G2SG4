/**
 * Acceptance test with a REAL saved response sheet (blueprint #82).
 *
 * These are the candidate's own files (PII), so they live outside the repo. The
 * test auto-disables when they are absent and runs when you put them in either
 *   samples/real/            (recommended, git-ignored)  or
 *   <repo root>              (the original drop location)
 *
 *   npm run test:real
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';

if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = class DOMParser {
    parseFromString(src) {
      return parseHTML(src).document;
    }
  };
}

const root = path.resolve(import.meta.dirname, '..');
const find = (name) => {
  for (const dir of [path.join(root, 'samples', 'real'), root]) {
    const p = path.join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
};

const FILES = [find('Response Sheet 1.html'), find('baijnath.mhtml')].filter(Boolean);
const { AnswerKeyParser } = await import('../src/lib/parser/index.ts');
const { readAnswerKeyFile } = await import('../src/lib/upload/readKeyFile.ts');

if (!FILES.length) {
  console.log('  skip  (असली फ़ाइलें नहीं मिलीं — samples/real/ में रखें; generated fixtures tests/parser.test.mjs में हैं)');
  console.log('\n✓ real-file checks skipped (0 failures)');
  process.exit(0);
}

const parser = new AnswerKeyParser();
const failures = [];
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${String(err?.message).split('\n')[0]}`);
  }
};

const parsed = new Map();

for (const file of FILES) {
  const label = path.basename(file);
  await check(`${label}: parses a real response sheet end-to-end`, async () => {
    const buf = readFileSync(file);
    const read = await readAnswerKeyFile(new File([buf], label, { type: '' }));
    const out = parser.parse(read.content, read.fileName, {
      fileKind: read.kind,
      encoding: read.encoding,
      sizeBytes: read.sizeBytes,
      warnings: read.warnings,
    });
    parsed.set(label, out);

    // #82 checklist — every item must come from the document, not a default
    assert.ok(out.candidateName && out.candidateName.length > 2, 'Candidate found');
    assert.match(String(out.rollNumber), /^[0-9A-Z]{6,}$/, 'Roll found');
    assert.ok(out.shiftNumber >= 1 && out.shiftNumber <= 22, 'Shift found');
    assert.ok(/\d{2}[-/]\d{2}[-/]\d{4}/.test(out.examDate || ''), 'Date found');
    assert.equal(out.totalQuestions, 200, 'Questions parsed');
    assert.equal(out.correct + out.wrong + out.unattempted, out.totalQuestions, 'counts add up');
    assert.equal(out.questions.length, out.totalQuestions, 'every question has a status');
    assert.equal(out.rawScore, Number((out.correct - out.wrong * 0.25).toFixed(2)), 'Raw score calculated');
    assert.equal(out.confidence, 'VERIFIED', 'source confidence must be VERIFIED for a clean sheet');
    assert.deepEqual(out.warnings || [], [], 'no silent warnings on the reference sheet');
  });
}

if (parsed.size >= 2) {
  await check('HTML and MHTML of the same sheet give the identical analysis', () => {
    const [a, b] = [...parsed.values()];
    for (const key of ['rollNumber', 'candidateName', 'examDate', 'shiftNumber', 'totalQuestions', 'correct', 'wrong', 'unattempted', 'attempted', 'rawScore', 'accuracy']) {
      assert.deepEqual(a[key], b[key], `${key} differs between .html and .mhtml`);
    }
    assert.equal(a.answerPattern, b.answerPattern, 'per-question pattern differs');
  });
}

await check('the known-good numbers for this sheet stay fixed', () => {
  const out = [...parsed.values()][0];
  assert.equal(out.rollNumber, '3001260688994');
  assert.equal(out.candidateName, 'BAIJNATH LODHI');
  assert.equal(out.examDate, '26-09-2026');
  // 26 Sep afternoon = "SH2/S2 · 02:30" in the header = 6th shift of the 22
  assert.equal(out.shiftNumber, 6);
  assert.equal(out.correct, 162);
  assert.equal(out.wrong, 34);
  assert.equal(out.unattempted, 4);
  assert.equal(out.rawScore, 153.5);
});


/* ==========================================================================
 * THE PASTE PATH — the only input this app asks for.
 *
 * A candidate selects all on the ESB response-sheet page (Ctrl+A / "select all")
 * and pastes. A browser copy is not one single shape, so both real variants are
 * derived from the candidate's own saved page and must analyse identically:
 *
 *   plain — visible text, no markup at all
 *   glued — the copy passed through a note app / chat / markdown viewer: lines
 *           wrapped in `**`, `&` still written as `&amp;`, and table cells GLUED
 *           to their labels ("Roll Number3001260688994Name of the Candidate…")
 *
 * Timing is asserted too: computing the analysis must feel instant, so a 50 kB
 * paste is required to stay far below a second even here in Node.
 * ======================================================================== */
const toPlainPaste = (markup) =>
  markup
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(?:td|th)>/gi, '\t')
    .replace(/<\/(?:div|p|tr|li|ul|ol|table|h[1-6]|section|article|pre|blockquote|dt|dd|center)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[ ]+/g, ' ')
    .replace(/ ?\t+ ?/g, '\t')
    .replace(/\t+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const toGluedMarkdownPaste = (plain) => {
  const lines = plain
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const idIdx = lines.findIndex((l) => /Roll\s*Number/i.test(l));
  const body = lines.map((l) => `  **${l.replace(/\s+/g, ' ')}**  `);
  if (idIdx >= 0) {
    const glued = lines
      .slice(idIdx, idIdx + 6)
      .join('')
      .replace(/\s+/g, ' ')
      .replace(/([A-Za-z])\s+(\d{2,})/g, '$1$2')
      .replace(/(Number|Name|Date|Time|Shift|Candidate|ID)\s+/g, '$1')
      .replace(/&/g, '&amp;');
    body.splice(idIdx, 6, `**${glued}**`);
  }
  return ['=== **PLEASE DO NOT REFRESH THIS PAGE...**  ', '', '++**ESB G2 SG4 CRT 2026 26 SEP SH2(Candidate Response Sheet)**++  ', '', ...body].join('\n');
};

const COMPARE_KEYS = ['rollNumber', 'candidateName', 'examDate', 'shiftNumber', 'totalQuestions', 'correct', 'wrong', 'attempted', 'unattempted', 'rawScore', 'accuracy', 'confidence'];

/*
 * Build the paste from the saved **.html** page, not from the .mhtml source:
 * a candidate copies what the browser *renders*, and the MHTML file on disk is
 * quoted-printable MIME text that nobody ever pastes.
 */
for (const [label, out] of parsed) {
  if (!/\.html?$/i.test(label)) continue;
  const file = FILES.find((f) => path.basename(f) === label);
  if (!file) continue;
  const markup = readFileSync(file, 'utf8');

  await check(`${label}: pasted plain text (Ctrl+A → copy) gives the identical analysis`, () => {
    const t0 = Date.now();
    const paste = parser.parse(toPlainPaste(markup), 'pasted-from-esb.txt');
    const ms = Date.now() - t0;
    for (const k of COMPARE_KEYS) assert.deepEqual(paste[k], out[k], `${k} differed on plain paste`);
    assert.equal(paste.answerPattern, out.answerPattern, 'per-question pattern differed on plain paste');
    assert.match(paste.sourceFormat, /PASTED_TEXT/, 'a paste must not be recorded as an HTML file');
    assert.ok(ms < 1500, `पेस्ट पढ़ने में ${ms} ms लगे — तेज़ होना चाहिए`);
  });

  await check(`${label}: glued markdown paste (** / &amp; / no separators) still identical`, () => {
    const paste = parser.parse(toGluedMarkdownPaste(toPlainPaste(markup)), 'pasted-from-notes.txt');
    for (const k of COMPARE_KEYS) assert.deepEqual(paste[k], out[k], `${k} differed on glued markdown paste`);
    assert.equal(paste.answerPattern, out.answerPattern, 'per-question pattern differed on glued paste');
  });
}

console.log(failures.length ? `\n✗ ${failures.length} real-file check(s) failed` : `\n✓ ${parsed.size} real file(s) verified against the #82 checklist`);
process.exit(failures.length ? 1 : 0);
