/**
 * Parser regression suite — proves that .html, .htm, .mhtml, .mht (base64),
 * UTF-16 and windows-1252 saved answer keys all produce the SAME analysis.
 *
 *   npm run test:parser        (or: npm test)
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseHTML } from 'linkedom';

/* the browser-only bits the parser relies on */
if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = class DOMParser {
    parseFromString(src) {
      return parseHTML(src).document;
    }
  };
}

const root = path.resolve(import.meta.dirname, '..');
const samples = path.join(root, 'samples');

/*
 * Fixtures are generated artifacts (1 MB, `npm run samples`) and are not
 * committed. Build them on demand so a fresh clone can run `npm test`
 * with zero setup.
 */
if (!existsSync(path.join(samples, 'manifest.json'))) {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'make-samples.mjs')], {
    cwd: root,
    stdio: 'ignore',
  });
}
const manifest = JSON.parse(readFileSync(path.join(samples, 'manifest.json'), 'utf8'));

const { AnswerKeyParser, decodeQuotedPrintable, unpackMHTMLDetailed, determineShiftGuess } = await import(
  '../src/lib/parser/index.ts'
);
const { decodeHtmlBytes, classifyFile, detectKindFromText } = await import('../src/lib/upload/readKeyFile.ts');

const parser = new AnswerKeyParser();
let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${name}\n      ${(e && e.message ? e.message : String(e)).split('\n')[0]}`);
  }
}

function read(name) {
  return readFileSync(path.join(samples, name));
}

function parseText(name) {
  const bytes = read(name);
  const { text } = decodeHtmlBytes(bytes);
  return parser.parse(text, name, {
    sizeBytes: bytes.length,
    encoding: 'test',
    fileKind: detectKindFromText(text),
  });
}

const EXPECTED = {
  rollNumber: manifest.candidate.rollNumber,
  correct: manifest.expected.correct,
  wrong: manifest.expected.wrong,
  attempted: manifest.expected.attempted,
  unattempted: manifest.expected.unattempted,
  totalQuestions: manifest.expected.totalQuestions,
  rawScore: manifest.expected.rawScore,
  shiftNumber: manifest.candidate.shiftNumber,
};

const summaryKeys = ['rollNumber', 'correct', 'wrong', 'attempted', 'unattempted', 'totalQuestions', 'rawScore', 'shiftNumber'];
const summarize = (r) => Object.fromEntries(summaryKeys.map((k) => [k, r[k]]));

/* ---------------------------------------------------------------------------
 * 1. THE HEADLINE REQUIREMENT: html and mhtml must behave identically
 * ------------------------------------------------------------------------- */

const GROUPS = [
  {
    label: 'MPESB response-sheet table',
    // …and the pasted-text shape, which is the app's primary input now
    files: [
      'mpesb-response-sheet.html',
      'mpesb-response-sheet.mhtml',
      'mpesb-response-sheet-base64.mht',
      'mpesb-paste-text.txt',
      'mpesb-paste-glued-markdown.txt',
    ],
  },
  { label: 'MPESB cbtexam.in blocks', files: ['mpesb-cbt-blocks.html', 'mpesb-cbt-blocks.mhtml', 'cbt-blocks-paste-text.txt'] },
  { label: 'TCS iON panels', files: ['tcs-ion-panels.html', 'tcs-ion-panels.mhtml', 'tcs-paste-text.txt'] },
  { label: 'summary-only paste (no table at all)', files: ['summary-only.html'] },
];

for (const group of GROUPS) {
  const results = group.files.map((f) => ({ file: f, out: parseText(f) }));

  await check(`${group.label}: identical analysis for every container (${group.files.length} files)`, () => {
    const first = summarize(results[0].out);
    assert.deepEqual(first, EXPECTED, `${results[0].file} -> ${JSON.stringify(first)}`);
    for (const r of results.slice(1)) {
      assert.deepEqual(summarize(r.out), first, `${r.file} differed from ${results[0].file}`);
    }
  });

  await check(`${group.label}: every question classified (200 statuses, 142 correct)`, () => {
    for (const r of results) {
      assert.equal(r.out.questions.length, 200, `${r.file}: expected 200 questions, got ${r.out.questions.length}`);
      assert.equal(r.out.questions.filter((q) => q.status === 'correct').length, 142);
      assert.equal(r.out.answerPattern.length, 200, `${r.file}: answer pattern missing`);
      assert.equal(r.out.confidence, 'VERIFIED');
    }
  });
}

/* ---------------------------------------------------------------------------
 * 2. Summary-only + encoding fallbacks
 * ------------------------------------------------------------------------- */

await check('summary-only.html: totals read from the printed summary', () => {
  const r = parseText('summary-only.html');
  assert.equal(r.correct, 142);
  assert.equal(r.wrong, 31);
  assert.equal(r.rawScore, 134.25);
  assert.equal(r.rollNumber, manifest.candidate.rollNumber);
  assert.equal(r.shiftNumber, 2);
  assert.match(r.sourceFormat, /SUMMARY_ONLY/);
  assert.ok(r.warnings.length >= 1, 'user must be warned to verify the numbers');
});

await check('UTF-16LE + BOM file parses the same as its UTF-8 twin', () => {
  const a = summarize(parseText('summary-only.html'));
  const b = summarize(parseText('summary-only-utf16.html'));
  assert.deepEqual(b, a);
});

await check('windows-1252 declared charset keeps accented text intact', () => {
  const bytes = read('windows1252-declared.html');
  const { text, encoding } = decodeHtmlBytes(bytes);
  assert.match(encoding, /1252/);
  assert.ok(text.includes('Gräberstraße'), 'mojibake: ' + text.slice(text.indexOf('Gr'), text.indexOf('Gr') + 30));
  const r = parser.parse(text, 'windows1252-declared.html');
  assert.equal(r.rollNumber, '2698765432');
  assert.equal(r.candidateName, 'SUNITA DEVI RATHORE');
  assert.equal(r.shiftNumber, 3, 'Shift 3 = 24 Sep morning');
});

await check('missing answer-key content still parses with a clear warning', () => {
  const r = parser.parse('<html><body><p>Nothing useful here</p></body></html>', 'blank.mhtml');
  assert.equal(r.questions.length, 0);
  assert.equal(r.confidence, 'WARNING');
  assert.ok(r.warnings.some((w) => /पेस्ट|प्रश्न/.test(w)));
});

await check('empty upload throws an actionable Hindi error', () => {
  assert.throws(() => parser.parse('   ', 'x.html'), /खाली/);
});

/* ---------------------------------------------------------------------------
 * 3. Quoted-printable + MHTML container internals
 * ------------------------------------------------------------------------- */

await check('quoted-printable: multi-byte Hindi split across a soft line break', () => {
  // "रा" = E0 A4 B0 E0 A4 BE, wrapped so the last char is split mid-sequence
  assert.equal(decodeQuotedPrintable('=E0=A4=B0=E0=A4=\r\n=BE'), 'रा');
  assert.equal(decodeQuotedPrintable('=E0=A4=B0=E0=A4=\n=BE'), 'रा');
  assert.equal(decodeQuotedPrintable('=E0=A4=B0=E0=A4=BE'), 'रा');
});

await check('quoted-printable: =3D escapes, trailing "=" and literal "="', () => {
  assert.equal(decodeQuotedPrintable('a=3Db'), 'a=b');
  assert.equal(decodeQuotedPrintable('tail='), 'tail=', 'a stray trailing = is preserved, never swallowed');
  assert.equal(decodeQuotedPrintable('100%=sure'), '100%=sure');
  assert.equal(decodeQuotedPrintable('line with space at end =20'), 'line with space at end  ');
});

await check('unpack: html part wins over css/png parts, and is unwrapped', () => {
  const mhtml = read('mpesb-response-sheet.mhtml').toString('utf8');
  const { html, isMhtml, transferEncoding, warnings } = unpackMHTMLDetailed(mhtml);
  assert.equal(isMhtml, true);
  assert.equal(transferEncoding, 'quoted-printable');
  assert.match(html, /<html/);
  assert.match(html, /menu-tbl/);
  assert.ok(!html.includes('font-family:Segoe UI;margin:0'), 'CSS part leaked into the html');
  assert.ok(!html.includes('iVBORw0KGgo'), 'image part leaked into the html');
  assert.deepEqual(warnings, []);
});

await check('unpack: base64 .mht part decodes to the same document', () => {
  const raw = read('mpesb-response-sheet-base64.mht').toString('utf8');
  const { html } = unpackMHTMLDetailed(raw);
  assert.match(html, /आंकांकित उत्तर/);
  assert.match(html, /<\/html>/);
});

await check('detectKindFromText: mhtml vs html vs plain', () => {
  assert.equal(detectKindFromText(read('mpesb-response-sheet.mhtml').toString('utf8')), 'MHTML');
  assert.equal(detectKindFromText(read('mpesb-response-sheet.html').toString('utf8')), 'HTML');
  assert.equal(detectKindFromText('just some text'), 'PLAIN');
});

/* ---------------------------------------------------------------------------
 * 4. Shift resolution (22 shifts, morning/afternoon, dd/mm safety)
 * ------------------------------------------------------------------------- */

await check('shift: "Examination" no longer fakes an AM match', () => {
  const g = determineShiftGuess('24/09/2026', '02.30 PM', 'MPESB Group-2 Sub Group-4 Examination');
  assert.equal(g.shiftNumber, 4, '24 Sep afternoon = shift 4');
  assert.equal(g.confident, true);
});

await check('shift: morning/afternoon on the same date resolve to different shifts', () => {
  assert.equal(determineShiftGuess('23/09/2026', '09:00 AM', '').shiftNumber, 1);
  assert.equal(determineShiftGuess('23/09/2026', '14:30', '').shiftNumber, 2);
  assert.equal(determineShiftGuess('01/10/2026', 'सुबह 9:00', '').shiftNumber, 15);
  assert.equal(determineShiftGuess('05/10/2026', 'दोपहर 02:30', '').shiftNumber, 22);
});

await check('shift: explicit "Shift 11"/"पारी 7" is authoritative', () => {
  assert.equal(determineShiftGuess('23/09/2026', 'Shift 11', '').shiftNumber, 11);
  assert.equal(determineShiftGuess('23/09/2026', 'पारी 7', '').shiftNumber, 7, 'an explicit shift beats a possibly misread date');
});

await check('shift: mm/dd ambiguity does not silently mis-date the candidate', () => {
  const g = determineShiftGuess('09/23/2026', '', '');
  assert.ok([1, 2].includes(g.shiftNumber), `got ${g.shiftNumber}`);
});

await check('shift: unknown date is reported as unverified, not silently shift 1', () => {
  const g = determineShiftGuess('15/12/2030', '', '');
  assert.equal(g.confident, false);
  assert.equal(g.reason, 'fallback');
});

/* ---------------------------------------------------------------------------
 * 5. File intake rules (extension/MIME sniffing the browser gives us)
 * ------------------------------------------------------------------------- */

await check('classify: .mhtml/.mht accepted even when file.type is empty', () => {
  for (const name of ['key.mhtml', 'KEY.MHT', 'page.HTML', 'sheet.htm', 'notes.txt']) {
    assert.equal(classifyFile({ name, type: '', size: 10 }).supported, true, name);
  }
  assert.equal(classifyFile({ name: 'key.mhtml', type: '' }).kind, 'MHTML');
  assert.equal(classifyFile({ name: 'key.html', type: '' }).kind, 'HTML');
  assert.equal(classifyFile({ name: 'no-extension', type: '' }).kind, 'HTML');
});

await check('classify: pdf / image / zip get instructions instead of a crash', () => {
  for (const name of ['scan.pdf', 'photo.JPG', 'answer-keys.zip', 'data.xlsx']) {
    assert.throws(() => classifyFile({ name, type: '', size: 10 }), /उत्तर कुंजी|फ़ाइल|CSV|Excel|अकाइव|मूल/u, name);
  }
});

await check('decodeHtmlBytes: BOM-less UTF-8 vs cp1252 picking', () => {
  const utf8 = new TextEncoder().encode('<html>राकेश</html>');
  assert.match(decodeHtmlBytes(utf8).encoding, /utf-8/);
  assert.ok(decodeHtmlBytes(utf8).text.includes('राकेश'));

  const withDeclared = new TextEncoder().encode('<meta charset="utf-8"><html>ok</html>');
  assert.equal(decodeHtmlBytes(withDeclared).suspicious, false);
});

await check('readAnswerKeyFile: real File objects (both formats) end-to-end', async () => {
  const { readAnswerKeyFile } = await import('../src/lib/upload/readKeyFile.ts');
  const out = [];
  for (const name of ['mpesb-response-sheet.html', 'mpesb-response-sheet.mhtml']) {
    const buf = read(name);
    const file = new File([buf], name, { type: '' });
    out.push(await readAnswerKeyFile(file));
  }
  assert.equal(out[0].kind, 'HTML');
  assert.equal(out[1].kind, 'MHTML');
  const scores = out.map((o) => summarize(parser.parse(o.content, o.fileName, o)));
  assert.deepEqual(scores[0], scores[1]);
  assert.deepEqual(scores[0], EXPECTED);
});

await check('readAnswerKeyFile: zero-byte and oversized guards', async () => {
  const { readAnswerKeyFile } = await import('../src/lib/upload/readKeyFile.ts');
  await assert.rejects(() => readAnswerKeyFile(new File([], 'empty.html', { type: '' })), /खाली/);
  const pdf = read('not-an-answer-key.pdf');
  await assert.rejects(
    () => readAnswerKeyFile(new File([pdf], 'not-an-answer-key.pdf', { type: 'application/pdf' })),
    /PDF/u
  );
});

/* --------------------------------------------------------------------------- */

console.log(`\n${passed} parser checks passed, ${failed} failed`);
if (failed) process.exitCode = 1;
