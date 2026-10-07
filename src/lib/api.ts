/**
 * Thin, defensive API client for the Rank Mitra backend.
 *
 * Two properties matter here:
 *
 * 1. Egress. Every GET revalidates with the stored ETag (`If-None-Match`).
 *    When the leaderboard has not changed the server replies `304` with an
 *    empty body, so a page that auto-refreshes every 30 minutes costs ~0.2 KB
 *    instead of re-downloading the whole dataset. That is what blew up the free
 *    Supabase tier before.
 * 2. Resilience. No call may throw into a component. Everything resolves to
 *    `{ ok:false, offline:true }` so the UI can fall back to local storage and
 *    queue the write for later.
 */
import type { AuditLog, CandidateRecord } from '../types';

/**
 * Base URL for the JSON API.
 *
 * Resolution order (first non-empty wins) so one `dist/` build can be moved
 * between hosts without recompiling:
 *   1. window.__RANK_MITRA_API__   — set from index.html / a config snippet
 *   2. VITE_API_BASE               — baked in at build time
 *   3. '/api'                      — same-origin (Vite proxy in dev, Netlify
 *                                    redirect or Cloudflare same-zone in prod)
 */
function resolveApiBase(): string {
  const injected =
    typeof window !== 'undefined' ? (window as unknown as { __RANK_MITRA_API__?: unknown }).__RANK_MITRA_API__ : undefined;
  const fromWindow = typeof injected === 'string' ? injected.trim() : '';
  const fromEnv = ((import.meta.env.VITE_API_BASE as string | undefined) || '').trim();
  return fromWindow || fromEnv || '/api';
}

const RAW_BASE: string = resolveApiBase();

export const API_DISABLED = /^(0|false|off|local)$/i.test(
  (import.meta.env.VITE_API_DISABLED as string | undefined) || ''
);

export const API_BASE = RAW_BASE.replace(/\/+$/, '');

const TIMEOUT_MS = Number((import.meta.env.VITE_API_TIMEOUT as string) || 10000);

const CACHE_KEY = 'rank_mitra_http_cache_v1';
const ADMIN_TOKEN_KEY = 'rank_mitra_admin_token_v1';
const CLAIMS_KEY = 'rank_mitra_claim_tokens_v1';
const MAX_CACHE_ENTRIES = 24;

export interface ApiEnvelope<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  /** 304 / cache hit — `data` came from the local cache. */
  notModified?: boolean;
  offline?: boolean;
}

/* ------------------------------------------------------------------ cache -- */

interface CacheEntry {
  etag?: string;
  ts: number;
  payload: unknown;
}
type CacheMap = Record<string, CacheEntry>;

function readCache(): CacheMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CacheMap) : {};
  } catch {
    return {};
  }
}

function writeCache(map: CacheMap) {
  try {
    const trimmed = Object.entries(map)
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, MAX_CACHE_ENTRIES);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    /* quota exceeded / private mode — cache is an optimisation only */
  }
}

/* ------------------------------------------------------------------ tokens -- */

export function getAdminToken(): string {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setAdminToken(token: string) {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {}
}

export function getClaimToken(rollNumber: string): string {
  try {
    const raw = localStorage.getItem(CLAIMS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map[normalize(rollNumber)] || '';
  } catch {
    return '';
  }
}

export function saveClaimToken(rollNumber: string, token: string) {
  try {
    const raw = localStorage.getItem(CLAIMS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[normalize(rollNumber)] = token;
    localStorage.setItem(CLAIMS_KEY, JSON.stringify(map));
  } catch {}
}

/** The exact set of fields this app is allowed to persist for a candidate. */
export function toSubmissionPayload(c: CandidateRecord & Record<string, any>) {
  return {
    rollNumber: c.rollNumber,
    candidateNamePrivate: c.candidateNamePrivate,
    candidateNamePublic: c.candidateNamePublic,
    email: c.email || '',
    category: c.category,
    gender: c.gender,
    exServiceman: !!c.exServiceman,
    contractStatus: !!c.contractStatus,
    qualifications: Array.isArray(c.qualifications) ? c.qualifications : [],
    shiftNumber: c.shiftNumber,
    shiftId: c.shiftId,
    examDate: c.examDate,
    totalQuestions: c.totalQuestions,
    correct: c.correct,
    wrong: c.wrong,
    attempted: c.attempted,
    unattempted: c.unattempted,
    rawScore: c.rawScore,
    accuracy: c.accuracy,
    // how the numbers were obtained — a label like 'MHTML'/'HTML'/'MANUAL' and
    // 'VERIFIED'/'WARNING', not a byte of the document itself
    sourceFormat: c.sourceFormat,
    confidence: (c as any).confidence ?? (c as any).parseConfidence,
    submittedAt: c.submittedAt,
  };
}

function normalize(roll: string) {
  return String(roll || '')
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase();
}

/* ----------------------------------------------------------------- client -- */

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; revalidate?: boolean; auth?: boolean; claimFor?: string } = {}
): Promise<ApiEnvelope<T>> {
  if (API_DISABLED) return { ok: false, status: 0, data: null, offline: true, error: 'API निष्क्रिय' };

  const method = (init.method || 'GET').toUpperCase();
  const cache = readCache();
  const cacheKey = `${path}|${method === 'GET' ? 'r' : 'w'}`;
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (method === 'GET' && !init.revalidate && cache[path]?.etag) headers['if-none-match'] = cache[path].etag!;
  if (init.auth !== false) {
    const admin = getAdminToken();
    if (admin) headers['x-admin-token'] = admin;
  }
  if (init.claimFor) {
    const claim = getClaimToken(init.claimFor);
    if (claim) headers['x-claim-token'] = claim;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });

    if (res.status === 304 && cache[path]) {
      return { ok: true, status: 304, data: cache[path].payload as T, notModified: true };
    }

    const text = await res.text();
    let payload: any = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    if (res.ok) {
      if (method === 'GET') {
        const etag = res.headers.get('etag') || undefined;
        cache[path] = { etag, ts: Date.now(), payload };
        writeCache(cache);
      }
      return { ok: true, status: res.status, data: payload as T };
    }

    return {
      ok: false,
      status: res.status,
      data: payload,
      error: payload?.error || payload?.detail || `अनुरोध विफल (HTTP ${res.status})`,
    };
  } catch (err: any) {
    // Network / timeout: serve a stale cached copy when we have one.
    if (method === 'GET' && cache[path]) {
      return { ok: true, status: 0, data: cache[path].payload as T, notModified: true, offline: true };
    }
    return {
      ok: false,
      status: 0,
      data: null,
      offline: true,
      error: err?.name === 'AbortError' ? 'सर्वर समय पर उत्तर नहीं दे सका।' : 'नेटवर्क त्रुटि — सर्वर से संपर्क नहीं हो पाया।',
    };
  } finally {
    clearTimeout(timer);
  }
}

const qs = (params: Record<string, string | number | undefined>) => {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== null) usp.set(k, String(v));
  const s = usp.toString();
  return s ? `?${s}` : '';
};

/* ---------------------------------------------------------------- surface -- */

export interface ServerCandidatePage {
  ok: boolean;
  examId?: string;
  total?: number;
  revision?: number;
  count?: number;
  candidates?: CandidateRecord[];
}

export interface ServerStats {
  ok: boolean;
  revision?: number;
  summary: {
    totalCandidates: number;
    avgRawScore: number;
    highestRawScore: number;
    medianRawScore?: number;
    avgAccuracy: number;
    avgAttempted: number;
    activeShifts: number;
    lastUpdate: string | null;
    byCategory: { category: string; count: number; topScore: number; avgScore: number }[];
    byGender: { gender: string; count: number; avgScore: number }[];
    histogram: { from: number; to: number; count: number }[];
  };
  shifts: {
    shiftNumber: number;
    candidateCount: number;
    avgRawScore: number;
    medianRawScore: number;
    highestRawScore: number;
    lowestRawScore: number;
    avgAccuracy: number;
    avgAttempted: number;
    avgCorrect: number;
    avgWrong: number;
  }[];
}

export interface RankBlock {
  overallRank: number;
  totalCandidates: number;
  categoryRank: number;
  totalCategoryCandidates: number;
  genderRank: number;
  totalGenderCandidates: number;
  shiftRank: number;
  totalShiftCandidates: number;
  percentile: number;
  topPercentage: number;
}

export const api = {
  enabled: !API_DISABLED,

  health: () => request<any>('/health', { auth: false }),

  config: () =>
    request<{
      ok: boolean;
      examId: string;
      cacheSeconds: number;
      liveDatabase: boolean;
      storage: string;
      emailEnabled: boolean;
      adminEnabled: boolean;
    }>('/config', { auth: false }),

  candidates: (opts: { limit?: number; shift?: number | 'all'; category?: string; gender?: string; q?: string; updatedSince?: string } = {}) =>
    request<ServerCandidatePage>(
      `/candidates${qs({ limit: opts.limit ?? 800, shift: opts.shift === 'all' ? undefined : opts.shift, category: opts.category, gender: opts.gender, q: opts.q, updated_since: opts.updatedSince })}`
    ),

  stats: () => request<ServerStats>('/stats'),

  candidate: (roll: string) => request<{ ok: boolean; candidate: CandidateRecord; rank: RankBlock }>(`/candidates/${encodeURIComponent(normalize(roll))}`, { claimFor: roll }),

  /**
   * POST /candidates — sends ONLY the derived numbers plus identity/shift.
   * The answer-key document, its filename, size and any per-question pattern
   * stay in the browser and are never transmitted or retained server-side.
   */
  submit: (candidate: CandidateRecord & { email?: string; answerPattern?: string; fileName?: string; fileBytes?: number }) =>
    request<{
      ok: boolean;
      created?: boolean;
      code?: string;
      candidate?: CandidateRecord;
      claimToken?: string;
      rank?: RankBlock | null;
      stats?: ServerStats['summary'] | null;
      message?: string;
      existing?: { rollNumber: string; rawScore: number };
    }>('/candidates', { method: 'POST', body: { candidate: toSubmissionPayload(candidate) }, auth: false }),

  updateProfile: (
    roll: string,
    fields: Partial<Pick<CandidateRecord, 'category' | 'gender' | 'qualifications' | 'exServiceman' | 'contractStatus' | 'postPreferences'>> & { email?: string }
  ) =>
    request<{ ok: boolean; candidate?: CandidateRecord; rank?: RankBlock }>(`/candidates/${encodeURIComponent(normalize(roll))}`, {
      method: 'PATCH',
      body: fields,
      claimFor: roll,
    }),

  remove: (roll: string) =>
    request<{ ok: boolean; deleted?: number }>(`/candidates/${encodeURIComponent(normalize(roll))}`, {
      method: 'DELETE',
      body: {},
      claimFor: roll,
    }),

  emailReport: (roll: string, email: string) =>
    request<{ ok: boolean; result?: any; emailEnabled?: boolean }>('/email/report', {
      method: 'POST',
      body: { rollNumber: roll, email },
      claimFor: roll,
    }),

  admin: {
    login: (password: string) =>
      request<{ ok: boolean; token?: string; expiresInHours?: number }>('/admin/login', {
        method: 'POST',
        body: { password },
        auth: false,
      }),

    audit: (limit = 100) => request<{ ok: boolean; logs: AuditLog[] }>(`/admin/audit${qs({ limit })}`),

    clear: () => request<{ ok: boolean; deleted?: number }>('/admin/clear', { method: 'POST', body: { confirm: 'DELETE ALL' } }),

    importCsv: (csv: string) =>
      request<{ ok: boolean; inserted?: number; skipped?: number; prepared?: number; invalid?: { roll: string; error: string }[] }>(
        '/admin/import',
        { method: 'POST', body: { csv } }
      ),

    exportUrl: (format: 'csv' | 'json', includePrivate = true) => {
      // Browser downloads cannot set headers, so the endpoint also accepts the
      // session token as a query parameter.
      const token = getAdminToken();
      return `${API_BASE}/admin/export${qs({ format, private: includePrivate ? '1' : undefined, token: token || undefined })}`;
    },

    testEmail: (to: string) => request<{ ok: boolean; provider?: string; result?: any }>('/admin/email-test', { method: 'POST', body: { to } }),
  },
};
