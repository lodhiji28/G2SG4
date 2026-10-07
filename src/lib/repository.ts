/**
 * Repository — the only place components talk to for data.
 *
 * Rules:
 *  1. Nothing here ever throws. Every function returns a result object with
 *     `ok`/`sync` so a component can render a good message instead of a blank
 *     screen when the database is unreachable.
 *  2. localStorage is written first (the user's data is never lost), then the
 *     server. If the server call fails the write is queued and retried.
 *  3. Server rows are authoritative for public numbers; local rows keep the
 *     private fields (name / e-mail) and offline-only submissions.
 */
import { api, getClaimToken, saveClaimToken, setAdminToken, getAdminToken } from './api';
import type { RankBlock, ServerStats } from './api';
import {
  addAuditLog,
  bumpPendingAttempt,
  clearAllCandidates,
  getCandidates,
  getPending,
  getSyncMeta,
  pushPending,
  removeLocalCandidate,
  removePending,
  saveCandidates,
  setApiReachable,
  setSyncMeta,
  updateCandidateProfile,
  upsertLocalCandidate,
} from './storage';
import type { PendingKind, SyncMeta } from './storage';
import type { CandidateRecord } from '../types';

export interface AuditRow {
  id: string;
  action: string;
  details: string;
  adminUser: string;
  timestamp: string;
}

export interface LoadResult {
  candidates: CandidateRecord[];
  sync: SyncMeta;
  /** true when fresh rows arrived (false on 304 / offline / disabled API). */
  changed: boolean;
  error?: string;
  serverStats?: ServerStats | null;
  serverTotal?: number;
  /** rows that exist only in this browser and still need syncing */
  pendingCount: number;
}

export interface SubmitResult {
  ok: boolean;
  duplicate?: boolean;
  /** saved locally, will be pushed to the database automatically later */
  offline?: boolean;
  message?: string;
  error?: string;
  rank?: RankBlock | null;
}

const keyOf = (roll: string) => String(roll || '').trim().toLowerCase();
const FETCH_LIMIT = Number((import.meta.env.VITE_LEADERBOARD_LIMIT as string) || 50000);

export const repository = {
  /** True when the API base URL is configured and not explicitly disabled. */
  get databaseConfigured(): boolean {
    return api.enabled;
  },

  /* -------------------------------------------------------------- reads --- */

  async load(opts: { force?: boolean; limit?: number } = {}): Promise<LoadResult> {
    const local = getCandidates();
    const pending = getPending().length;

    if (!api.enabled) {
      return {
        candidates: local,
        sync: setSyncMeta({ mode: 'local', total: local.length }),
        changed: false,
        pendingCount: pending,
      };
    }

    const res = await api.candidates({ limit: opts.limit ?? FETCH_LIMIT });
    const rows = res.data?.candidates ?? [];

    if (res.status === 0) {
      setApiReachable(false);
      return {
        candidates: local,
        sync: setSyncMeta({ mode: 'offline', total: local.length, lastError: res.error }),
        changed: false,
        error: res.error,
        pendingCount: pending,
      };
    }

    setApiReachable(true);

    // 304 (or a cached replay) — nothing changed on the server: keep the mirror.
    if (res.notModified) {
      return {
        candidates: local,
        sync: setSyncMeta({
          mode: 'live',
          total: res.data?.total ?? local.length,
          revision: getSyncMeta().revision,
          lastSyncAt: new Date().toISOString(),
          lastError: undefined,
        }),
        changed: false,
        pendingCount: pending,
      };
    }

    if (!res.ok) {
      return {
        candidates: local,
        sync: setSyncMeta({ mode: 'offline', total: local.length, lastError: res.error }),
        changed: false,
        error: res.error,
        pendingCount: pending,
      };
    }

    const localByKey = new Map(local.map((c) => [keyOf(c.rollNumber), c]));
    const serverKeys = new Set<string>();

    const merged: CandidateRecord[] = rows.map((row) => {
      const k = keyOf(row.rollNumber);
      serverKeys.add(k);
      const mine = localByKey.get(k);
      return {
        ...row,
        // The public endpoint never returns these; keep the local copy.
        candidateNamePrivate: mine?.candidateNamePrivate ?? row.candidateNamePrivate,
        email: mine?.email ?? row.email,
        answerPattern: mine?.answerPattern ?? row.answerPattern,
        isSelf: Boolean(mine) || Boolean(getClaimToken(row.rollNumber)),
        isLocalOnly: false,
      };
    });

    // Offline-only rows stay visible (badged) instead of silently vanishing.
    const localOnly = local.filter((c) => !serverKeys.has(keyOf(c.rollNumber)));
    for (const c of localOnly) merged.push({ ...c, isLocalOnly: true });

    saveCandidates(merged);
    addAuditLog(
      'SYNC',
      `${merged.length - localOnly.length} पंक्तियाँ डेटाबेस से ली गईं (revision ${res.data?.revision ?? '?'})`
    );

    const sync = setSyncMeta({
      mode: 'live',
      total: res.data?.total ?? merged.length,
      revision: res.data?.revision ?? 0,
      lastSyncAt: new Date().toISOString(),
      lastError: undefined,
      synced: merged.length,
    });

    return { candidates: merged, sync, changed: true, serverTotal: res.data?.total, pendingCount: getPending().length };
  },

  async loadStats(): Promise<ServerStats | null> {
    if (!api.enabled) return null;
    const res = await api.stats();
    return res.ok ? ((res.data as ServerStats) ?? null) : null;
  },

  /** Leaderboard + aggregates + queued writes, in one shot (used by Refresh). */
  async refreshAll(): Promise<LoadResult> {
    const synced = await repository.flushPending().catch(() => 0);
    const loaded = await repository.load({ force: true });
    const stats = await repository.loadStats().catch(() => null);
    return { ...loaded, serverStats: stats, changed: loaded.changed || synced > 0 };
  },

  /* -------------------------------------------------------------- write --- */

  async submit(input: CandidateRecord): Promise<SubmitResult> {
    if (!input.rollNumber) return { ok: false, error: 'रोल नंबर अनिवार्य है।' };

    // Local duplicate guard works even with no network at all.
    const dupLocal = getCandidates().find((c) => keyOf(c.rollNumber) === keyOf(input.rollNumber) && !c.isLocalOnly);
    if (dupLocal && !api.enabled) {
      return { ok: false, duplicate: true, error: 'इस रोल नंबर की उत्तर कुंजी इस डिवाइस पर पहले से दर्ज है।' };
    }

    upsertLocalCandidate({ ...input, isSelf: true, isLocalOnly: !api.enabled });

    if (!api.enabled) {
      return { ok: true, message: 'डेटा इस ब्राउज़र में सहेजा गया (डेटाबेस कॉन्फ़िगर नहीं है)।' };
    }

    const res = await api.submit(input);

    if (res.ok) {
      if (res.data?.claimToken) saveClaimToken(input.rollNumber, res.data.claimToken);
      removePending(input.rollNumber, 'submit');
      setApiReachable(true);
      setSyncMeta({ mode: 'live', lastSyncAt: new Date().toISOString(), lastError: undefined });
      return { ok: true, message: res.data?.message, rank: res.data?.rank ?? null };
    }

    if (res.status === 409) {
      // The database already has this roll number: drop our local copy so the
      // shared leaderboard cannot contain two rows for one candidate.
      removeLocalCandidate(input.rollNumber);
      removePending(input.rollNumber, 'submit');
      return { ok: false, duplicate: true, error: res.error || 'यह रोल नंबर पहले से दर्ज है।' };
    }

    // 4xx from validation means "fix this", everything else means "retry later".
    const rejected = res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408;
    if (rejected) return { ok: false, error: res.error || 'सबमिशन अस्वीकृत किया गया।' };

    const queue = getPending().find((p) => p.kind === 'submit' && p.rollNumber === input.rollNumber);
    if (queue && queue.attempts >= 3) bumpPendingAttempt(input.rollNumber, res.error || 'retry later', 'submit');
    else pushPending('submit', input.rollNumber, input);

    setSyncMeta({ mode: 'offline', lastError: res.error });
    return {
      ok: true,
      offline: true,
      message: 'आपका डेटा इस डिवाइस पर सहेजा गया है और सर्वर से जुड़ते ही अपने आप भेज दिया जाएगा।',
    };
  },

  async updateProfile(
    rollNumber: string,
    fields: Partial<Pick<CandidateRecord, 'category' | 'gender' | 'qualifications' | 'exServiceman' | 'contractStatus' | 'postPreferences'>>
  ): Promise<{ success: boolean; error?: string; synced: boolean }> {
    const local = updateCandidateProfile(rollNumber, fields);
    if (!local.success) return { success: false, error: local.error, synced: false };
    if (!api.enabled) return { success: true, synced: false };

    const res = await api.updateProfile(rollNumber, fields);
    if (res.ok) {
      removePending(rollNumber, 'patch');
      return { success: true, synced: true };
    }

    // 401/403/404: this browser has no claim token for that row (e.g. the
    // submission was made on another device). Keep it queued; admin can fix.
    pushPending('patch', rollNumber, fields);
    return { success: true, synced: false, error: res.error };
  },

  async remove(rollNumber: string): Promise<{ success: boolean; error?: string; synced: boolean }> {
    const local = getCandidates().find((c) => keyOf(c.rollNumber) === keyOf(rollNumber));
    removeLocalCandidate(rollNumber);
    removePending(rollNumber, 'submit');
    if (!api.enabled) return { success: true, synced: false };

    const res = await api.remove(rollNumber);
    if (res.ok) return { success: true, synced: true };

    if (local) upsertLocalCandidate({ ...local, isLocalOnly: true });
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return { success: false, error: res.error, synced: false };
    }
    pushPending('delete', rollNumber, null);
    return { success: true, synced: false, error: res.error };
  },

  /** Send the analysis report to the candidate's e-mail address. */
  async emailReport(rollNumber: string, email: string): Promise<{ ok: boolean; error?: string; note?: string }> {
    if (!/^[^\s@]+@[^\s@]+\.\w{2,}$/.test(String(email).trim())) {
      return { ok: false, error: 'कृपया सही ई-मेल पता दर्ज करें।' };
    }
    if (!api.enabled) {
      return { ok: false, error: 'ई-मेल केवल तभी भेजा जा सकता है जब डेटाबेस/API जुड़ा हो।' };
    }
    const res = await api.emailReport(rollNumber, email.trim().toLowerCase());
    if (!res.ok) return { ok: false, error: res.error };
    const data: any = res.data ?? {};
    return {
      ok: true,
      note: data.emailEnabled
        ? 'आपकी रिपोर्ट ई-मेल कर दी गई है (इनबॉक्स में कुछ मिनट लग सकते हैं)।'
        : 'रिपोर्ट तैयार हो गई — सर्वर पर EMAIL_PROVIDER अभी भी console मोड में है, इसलिए ई-मेल केवल लॉग में जाएगा।',
    };
  },

  /* --------------------------------------------------------------- queue -- */

  pendingCount(): number {
    return getPending().length;
  },

  /** Replays queued writes against the server. Returns how many succeeded. */
  async flushPending(): Promise<number> {
    if (!api.enabled) return 0;
    const queue = getPending();
    if (!queue.length) return 0;
    let done = 0;

    for (const item of queue) {
      const kind: PendingKind = item.kind || 'submit';
      let res;
      if (kind === 'delete') res = await api.remove(item.rollNumber);
      else if (kind === 'patch') res = await api.updateProfile(item.rollNumber, item.payload);
      else res = await api.submit(item.payload);

      if (res.ok) {
        const payload: any = res.data ?? {};
        if (kind === 'submit') {
          if (payload.claimToken) saveClaimToken(item.rollNumber, String(payload.claimToken));
          upsertLocalCandidate({ ...item.payload, isLocalOnly: false, isSelf: true });
        } else if (kind === 'delete') {
          removeLocalCandidate(item.rollNumber);
        }
        removePending(item.rollNumber, kind);
        addAuditLog('QUEUE_SYNCED', `${kind} · रोल ${item.rollNumber} डेटाबेस में भेजा गया`, 'System');
        done++;
      } else if (res.status === 409 || (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408)) {
        removePending(item.rollNumber, kind);
      } else {
        bumpPendingAttempt(item.rollNumber, res.error || 'retry later', kind);
      }
    }

    if (done) setSyncMeta({ mode: 'live', lastSyncAt: new Date().toISOString() });
    return done;
  },

  /* --------------------------------------------------------------- admin -- */

  admin: {
    isSignedIn: () => Boolean(getAdminToken()),

    async login(password: string): Promise<{ ok: boolean; error?: string }> {
      const res = await api.admin.login(password);
      if (res.ok && res.data?.token) {
        setAdminToken(res.data.token);
        addAuditLog('ADMIN_LOGIN', 'प्रशासक ने लाइव API के माध्यम से साइन इन किया', 'Admin');
        return { ok: true };
      }
      return { ok: false, error: res.error || 'सर्वर से संपर्क नहीं हो पाया।' };
    },

    logout() {
      setAdminToken('');
    },

    async audit(limit = 100): Promise<AuditRow[] | null> {
      const res = await api.admin.audit(limit);
      if (!res.ok) return null;
      return ((res.data as any)?.logs as AuditRow[]) ?? [];
    },

    async clearAll(): Promise<{ ok: boolean; deleted?: number; error?: string }> {
      const res = await api.admin.clear();
      if (!res.ok) return { ok: false, error: res.error };
      clearAllCandidates();
      return { ok: true, deleted: res.data?.deleted };
    },

    async importCsv(csv: string): Promise<{ ok: boolean; error?: string; inserted?: number; skipped?: number; invalid?: any[] }> {
      const res = await api.admin.importCsv(csv);
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, ...((res.data as any) ?? {}) };
    },

    exportUrl: (format: 'csv' | 'json', includePrivate = true) => api.admin.exportUrl(format, includePrivate),

    async testEmail(to: string): Promise<{ ok: boolean; error?: string; result?: any }> {
      const res = await api.admin.testEmail(to);
      return res.ok ? { ok: true, result: res.data } : { ok: false, error: res.error };
    },

    async health(): Promise<any | null> {
      const res = await api.health();
      return res.ok ? res.data : null;
    },
  },

  syncMeta: () => getSyncMeta(),
};
