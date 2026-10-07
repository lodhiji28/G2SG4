#!/usr/bin/env node
/**
 * Verifies the parser against REAL saved answer keys (the ones a candidate
 * produces with Ctrl+S), not just the generated fixtures.
 *
 *   npm run verify:real                       # every file in samples/real/
 *   npm run verify:real -- path/to/Response\ Sheet.html
 *
 * Files are read from disk only — nothing is uploaded anywhere. This is the
 * check to run after adding a new board format: it prints the exact numbers
 * the UI would show, plus every warning, so a silent mis-parse is visible.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
const { AnswerKeyParser } = await import('../src/lib/parser/index.ts');
const { readAnswerKeyFile } = await import('../src/lib/upload/readKeyFile.ts');

const dir = path.join(root, 'samples', 'real');
const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const files = args.length
  ? args
  : existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => !f.startsWith('.') && !/\.pdf$/i.test(f))
      .map((f) => path.join(dir, f))
      .filter((f) => statSync(f).isFile())
  : [];

if (!files.length) {
  console.log(
    `कोई असली फ़ाइल नहीं मिली। रखें: ${path.relative(root, dir)}/  (उदा. "Response Sheet 1.html", "baijnath.mhtml")`
  );
  process.exit(0);
}

const parser = new AnswerKeyParser();
let bad = 0;
let problems = 0;

for (const file of files) {
  const name = path.basename(file);
  console.log(`\n=== ${name} ===`);
  try {
    const buf = readFileSync(file);
    const t0 = Date.now();
    const read = await readAnswerKeyFile(new File([buf], name, { type: '' }));
    const out = parser.parse(read.content, read.fileName, {
      fileKind: read.kind,
      encoding: read.encoding,
      sizeBytes: read.sizeBytes,
      warnings: read.warnings,
    });
    const qs = Array.isArray(out.questions) ? out.questions : [];
    const s = out; // the parser returns the summary at the top level
    console.log(
      `  bytes ${(buf.length / 1024).toFixed(0)} KB · decoded ${(read.content.length / 1024).toFixed(0)} KB chars` +
        ` · kind ${read.kind} · enc ${read.encoding} · ${Date.now() - t0} ms`
    );
    console.log(`  format ${out.sourceFormat} · kind ${out.fileKind} · confidence ${out.confidence}`);
    console.log(
      `  roll ${out.rollNumber ?? '—'} · name "${out.candidateName ?? '—'}" · date ${out.examDate ?? '—'}` +
        ` · shift ${out.shiftNumber ?? '—'} / ${out.shiftId ?? '—'}`
    );
    console.log(
      `  total ${s.totalQuestions} · correct ${s.correct} · wrong ${s.wrong} · attempted ${s.attempted}` +
        ` · unattempted ${s.unattempted} · raw ${s.rawScore} · acc ${s.accuracy}%`
    );
    if (qs.length) {
      const counts = {};
      for (const q of qs) counts[q.status] = (counts[q.status] || 0) + 1;
      console.log(`  questions ${qs.length} · statuses ${JSON.stringify(counts)}`);
      const sum = qs.filter((q) => q.status === 'correct').length;
      const mism = qs.length === s.totalQuestions && sum !== s.correct;
      if (mism) problems++;
      console.log(`  per-question correct ${sum} vs summary ${s.correct} ${mism ? '← MISMATCH' : '✓ match'}`);
      const sample = qs.find((q) => q.status === 'wrong') || qs[0];
      console.log(`  sample Q${sample?.questionNumber}: ${JSON.stringify(sample)}`);
    }
    const marksOk = s.correct + s.wrong + s.unattempted === s.totalQuestions;
    if (!marksOk) problems++;
    console.log(`  ${marksOk ? '✓' : '✗'} correct+wrong+unattempted = total`);
    const scoreOk = Math.abs(s.rawScore - (s.correct - s.wrong * 0.25)) < 0.005;
    if (!scoreOk) problems++;
    console.log(`  ${scoreOk ? '✓' : '✗'} rawScore = correct − 0.25×wrong`);
    if (out.warnings?.length) {
      console.log(`  ⚠ ${out.warnings.length} warning(s):`);
      for (const w of out.warnings.slice(0, 10)) console.log(`     · ${typeof w === 'string' ? w : w?.message || JSON.stringify(w)}`);
    }
  } catch (err) {
    problems++;
    console.log(`  ✗ FAILED: ${err.message}`);
    console.log(
      String(err.stack || '')
        .split('\n')
        .slice(1, 4)
        .join('\n')
    );
  }
}

const total = bad + problems;
console.log(total ? `\n⚠ ${total} समस्या मिली — ऊपर देखें।` : `\n✓ सभी असली फ़ाइलें एक जैसे साफ़ नतीजे दे रही हैं।`);
process.exit(total ? 1 : 0);
