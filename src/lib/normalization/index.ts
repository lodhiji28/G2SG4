/**
 * MPESB Normalised Equi-Percentile (NEP) scaling — phase-2 preview.
 *
 * Source: "समूह-02 उपसमूह-04 संयुक्त भर्ती परीक्षा-2026 परीक्षा संचालन एवं भर्ती नियमपुस्तिका",
 * म.प्र. कर्मचारी चयन मंडल, भोपाल — चयन/मूल्यांकन अनुबंध (पृष्ठ ~131), मंडल आदेश क्र.
 * 11-80/2013/08/पी-2/625/2025 दिनांक 24/01/2025 से गठित समिति की अनुशंसा पर स्वीकृत सूत्र:
 *
 *   (a) एक-चरणीय परीक्षा: shifts S1…SK, each with Nj candidates; Xij = actual/proportionate
 *       marks of candidate i in shift j; Pij = percentile score of Xij. Percentiles of the
 *       shifts are equated and the merit list is prepared from them.
 *   (b) बहु-चरणीय परीक्षा:
 *       Step 1  percentile Pij  (as above)
 *       Step 2  Zij = ROUND(NORMSINV(Pij − 0.005), 6)          // standard normal inverse
 *       Step 3  Tij = AM + ASD × Zij,  AM = maxMarks/2,  ASD = maxMarks/10
 *       Step 4  Final = Tij + (physical/personal-test score)
 *       tie-break: proportionate marks first, then existing MPESB practice
 *       all values rounded to six decimals.
 *
 * WHY THIS IS OFF BY DEFAULT
 * The platform shows RAW MARKS ONLY (blueprint #3): the board publishes normalized results
 * itself, and its exact percentile convention (how ties inside a shift are counted) is not
 * spelled out in the rulebook text we hold. `equi` below is the standard NEP reading; a
 * `rank`/`lessOrEqual` alternative is provided so the difference is visible rather than hidden.
 * Anyone comparing with an official list must treat this as indicative only.
 */

export type PercentileDefinition = 'equi' | 'lessOrEqual' | 'strictlyLess';

export interface NepInput {
  rollNumber: string;
  shiftNumber: number;
  /** raw marks actually scored (Xij when the paper is out of `maxMarks`) */
  rawScore: number;
  /** optional: marks as a share of that shift's paper maximum, if papers differed */
  maxMarksForShift?: number;
}

export interface NepResult {
  rollNumber: string;
  shiftNumber: number;
  rawScore: number;
  maxMarksForShift: number;
  maxMarks: number;
  proportionate: number;
  percentile: number;
  zValue: number;
  tScore: number;
  shiftRank: number;
  shiftSize: number;
}

const round6 = (x: number) => Number(x.toFixed(6));

/**
 * Abramowitz & Stegun 26.2.22 rational approximation of the inverse standard normal CDF —
 * the same function Excel's NORMSINV implements (to ~1e-9), so `npm run test` can pin the
 * formula without pulling a stats library.
 */
export function normSinv(p: number): number {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number, r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/** Percentile of `value` inside `sortedAsc`, per the chosen convention (0…100). */
export function percentileOf(sortedAsc: number[], value: number, def: PercentileDefinition = 'equi'): number {
  const n = sortedAsc.length;
  if (!n) return 0;
  let less = 0;
  let equal = 0;
  for (const v of sortedAsc) {
    if (v < value - 1e-9) less++;
    else if (Math.abs(v - value) <= 1e-9) equal++;
  }
  const pct =
    def === 'strictlyLess'
      ? (100 * less) / n
      : def === 'lessOrEqual'
      ? (100 * (less + equal)) / n
      : (100 * (less + 0.5 * equal)) / n; // equi-percentile (standard NEP reading)
  return round6(Math.min(100, Math.max(0, pct)));
}

/**
 * Full NEP pass: group by shift → percentile within shift → Z → T-score on the paper maximum.
 * Returns one row per candidate, plus the shift means before/after adjustment (that delta is
 * exactly what "this shift was harder" means in the official scheme).
 */
export function computeNep(
  rows: NepInput[],
  opts: { maxMarks?: number; definition?: PercentileDefinition } = {}
): { candidates: NepResult[]; byShift: { shiftNumber: number; size: number; rawMean: number; tMean: number }[] } {
  const defaultMax = opts.maxMarks ?? 200;
  const byShift = new Map<number, NepInput[]>();
  for (const r of rows) {
    const list = byShift.get(r.shiftNumber) || [];
    list.push(r);
    byShift.set(r.shiftNumber, list);
  }

  const out: NepResult[] = [];
  const shiftStats: { shiftNumber: number; size: number; rawMean: number; tMean: number }[] = [];

  for (const [shiftNumber, group] of [...byShift.entries()].sort((a, b) => a[0] - b[0])) {
    const maxMarks = group[0].maxMarksForShift ?? defaultMax;
    const prop = group.map((g) => round6((g.rawScore / Math.max(1, maxMarks)) * 100));
    const sorted = [...prop].sort((a, b) => a - b);
    let rawSum = 0;
    let tSum = 0;
    group.forEach((g, i) => {
      const proportionate = prop[i];
      const percentile = percentileOf(sorted, proportionate, opts.definition);
      // Step 2 — NORMSINV(P − 0.005): the 0.005 offset keeps the top/bottom off ±Infinity.
      const z = round6(normSinv(Math.min(0.9999995, Math.max(0.0000005, (percentile - 0.005 * 100) / 100))));
      const am = maxMarks / 2;
      const asd = maxMarks / 10;
      const t = round6(am + asd * z);
      rawSum += g.rawScore;
      tSum += t;
      out.push({
        rollNumber: g.rollNumber,
        shiftNumber,
        rawScore: g.rawScore,
        maxMarksForShift: maxMarks,
        maxMarks,
        proportionate,
        percentile,
        zValue: z,
        tScore: t,
        shiftRank: 0,
        shiftSize: group.length,
      });
    });
    shiftStats.push({
      shiftNumber,
      size: group.length,
      rawMean: round6(rawSum / group.length),
      tMean: round6(tSum / group.length),
    });
  }

  // rank inside the shift (on T-score, which is the comparable quantity)
  for (const shift of shiftStats) {
    const inShift = out.filter((c) => c.shiftNumber === shift.shiftNumber).sort((a, b) => b.tScore - a.tScore);
    inShift.forEach((c, idx) => {
      c.shiftRank = idx + 1;
    });
  }

  return { candidates: out, byShift: shiftStats };
}
