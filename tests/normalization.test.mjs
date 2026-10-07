/**
 * NEP normalization math (blueprint #72) — the formula must be pinned, because a
 * silent drift here would quietly reorder people in a "board-style" comparison.
 *
 *   npm run test:nep
 */
import assert from 'node:assert/strict';
import { normSinv, percentileOf, computeNep } from '../src/lib/normalization/index.ts';

const failures = [];
let passed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${String(err?.message).split('\n')[0]}`);
  }
};

await check('normSinv matches Excel NORMSINV at the anchors', () => {
  assert.equal(Math.abs(normSinv(0.5)) < 1e-9, true, 'NORMSINV(0.5) must be 0');
  assert.equal(Number(normSinv(0.975).toFixed(6)), 1.959964);
  assert.equal(Number(normSinv(0.025).toFixed(6)), -1.959964);
  assert.equal(Number(normSinv(0.8413447).toFixed(4)), 1.0);
  assert.equal(Number(normSinv(0.5 - 0.005).toFixed(6)), Number(normSinv(0.495).toFixed(6)));
});

await check('percentile conventions differ exactly as documented', () => {
  const sorted = [10, 20, 20, 30, 40];
  // equi: 1 below + 2 equal → (1 + 0.5*2)/5 = 40%
  assert.equal(percentileOf(sorted, 20, 'equi'), 40);
  assert.equal(percentileOf(sorted, 20, 'lessOrEqual'), 60);
  assert.equal(percentileOf(sorted, 20, 'strictlyLess'), 20);
  assert.equal(percentileOf([], 5), 0);
});

await check('a harder shift moves its candidates UP in T-score (the point of NEP)', () => {
  // shift 1: easy (everyone ~160/200) — shift 2: hard (same ability ~110/200)
  const rows = [
    ...Array.from({ length: 5 }, (_, i) => ({ rollNumber: `a${i}`, shiftNumber: 1, rawScore: 150 + i, totalQuestions: 200 })),
    ...Array.from({ length: 5 }, (_, i) => ({ rollNumber: `b${i}`, shiftNumber: 2, rawScore: 100 + i, totalQuestions: 200 })),
  ].map((r) => ({ ...r, maxMarksForShift: r.totalQuestions }));

  const { candidates, byShift } = computeNep(rows, { maxMarks: 200 });
  assert.equal(candidates.length, 10);
  assert.equal(byShift.length, 2);

  const s1 = byShift.find((s) => s.shiftNumber === 1);
  const s2 = byShift.find((s) => s.shiftNumber === 2);
  assert.equal(s1.size, 5);
  assert.equal(s2.size, 5);

  // raw means stay far apart…
  assert.ok(s1.rawMean > s2.rawMean, 'raw means must differ');
  // …but the T-score means converge, because each shift is now centred on its own curve
  assert.ok(Math.abs(s1.tMean - s2.tMean) < Math.abs(s1.rawMean - s2.rawMean), 'NEP must compress the shift gap');

  // identical pool size + same relative position ⇒ same percentile on both sides
  const topA = candidates.filter((c) => c.shiftNumber === 1).sort((a, b) => b.tScore - a.tScore)[0];
  const topB = candidates.filter((c) => c.shiftNumber === 2).sort((a, b) => b.tScore - a.tScore)[0];
  assert.equal(topA.percentile, topB.percentile);
  assert.equal(topA.shiftRank, 1);
  assert.equal(topB.shiftRank, 1);
});

await check('T-score sits at AM + ASD·Z with AM=max/2, ASD=max/10', () => {
  const { candidates } = computeNep(
    [
      { rollNumber: 'x1', shiftNumber: 1, rawScore: 120, maxMarksForShift: 200 },
      { rollNumber: 'x2', shiftNumber: 1, rawScore: 140, maxMarksForShift: 200 },
      { rollNumber: 'x3', shiftNumber: 1, rawScore: 160, maxMarksForShift: 200 },
    ],
    { maxMarks: 200 }
  );
  for (const c of candidates) {
    const am = 200 / 2;
    const asd = 200 / 10;
    assert.equal(c.tScore, Number((am + asd * c.zValue).toFixed(6)), 'T = AM + ASD·Z');
    assert.ok(c.percentile > 0 && c.percentile < 100, 'finite percentiles only (0.005 offset works)');
    assert.ok(Number.isFinite(c.zValue));
  }
});

await check('single-candidate shift does not explode (top of an empty tail)', () => {
  const { candidates } = computeNep([{ rollNumber: 'solo', shiftNumber: 7, rawScore: 100, maxMarksForShift: 200 }], { maxMarks: 200 });
  assert.equal(candidates.length, 1);
  assert.ok(Number.isFinite(candidates[0].tScore), 'a lone candidate must still get a finite T-score');
});

console.log(failures.length ? `\n✗ ${failures.length} NEP check(s) failed` : `\n✓ ${passed} NEP checks passed`);
process.exit(failures.length ? 1 : 0);
