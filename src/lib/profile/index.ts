import type { CandidateRecord } from '../../types';

/**
 * Profile completeness (blueprint #40/#41).
 *
 * A record stays valid for the overall rank even when optional fields are
 * empty — the percentage only tells the candidate how much of the analytics
 * they are missing, and drives the dashboard's data-quality KPIs.
 */
export interface CompletionResult {
  percent: number;
  missing: string[];
}

/**
 * The three fields a candidate may set at all — nothing else counts toward
 * "profile complete", because nothing else can be filled in any more.
 * (Post preferences and the optional report e-mail were removed from the product,
 * so keeping them here would permanently hold every profile below 100%.)
 */
const WEIGHTS: { key: string; label: string; weight: number }[] = [
  { key: 'category', label: 'श्रेणी', weight: 35 },
  { key: 'gender', label: 'लिंग', weight: 30 },
  { key: 'qualifications', label: 'योग्यताएँ', weight: 35 },
];

export function profileCompletion(c: Partial<CandidateRecord> | null | undefined): CompletionResult {
  if (!c) return { percent: 0, missing: WEIGHTS.map((w) => w.label) };
  const filled = (key: string) => {
    const v = (c as Record<string, unknown>)[key];
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.trim().length > 0;
    return v !== undefined && v !== null;
  };
  const total = WEIGHTS.reduce((a, w) => a + w.weight, 0);
  let got = 0;
  const missing: string[] = [];
  for (const w of WEIGHTS) {
    if (filled(w.key)) got += w.weight;
    else missing.push(w.label);
  }
  return { percent: Math.round((got / total) * 100), missing };
}

/** Does this candidate hold at least one of the post's required qualifications? */
export function isEligibleFor(c: Pick<CandidateRecord, 'qualifications'>, required: string[] | undefined): boolean {
  const have = c.qualifications || [];
  if (!required?.length) return true;
  if (!have.length) return false;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u0900-\u097F]/g, '');
  return required.some((want) =>
    have.some((h) => {
      const a = norm(h);
      const b = norm(want);
      return !!a && !!b && (a.includes(b) || b.includes(a));
    })
  );
}

/**
 * Post-wise competition view (blueprint #31/#32): among the submitted keys,
 * the pool of candidates who put this post in their preference list.
 */
export interface PostPoolStats {
  postCode: string;
  poolSize: number;
  avgScore: number;
  topScore: number;
  userScore: number | null;
  userRank: number | null;
  preferencePosition: number | null;
}

export function postPoolStats(postCode: string, candidates: CandidateRecord[], userRoll?: string | null): PostPoolStats {
  const pool = candidates.filter((c) => (c.postPreferences || []).includes(postCode));
  const scores = pool.map((c) => c.rawScore);
  const sorted = [...pool].sort((a, b) => b.rawScore - a.rawScore);
  const user = userRoll ? pool.find((c) => c.rollNumber === userRoll) : undefined;
  return {
    postCode,
    poolSize: pool.length,
    avgScore: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0,
    topScore: scores.length ? Math.max(...scores) : 0,
    userScore: user ? user.rawScore : null,
    userRank: user ? sorted.findIndex((c) => c.rollNumber === user.rollNumber) + 1 : null,
    preferencePosition: user ? (user.postPreferences || []).indexOf(postCode) + 1 : null,
  };
}
