import { CandidateRecord, AuditLog } from '../types';

const CANDIDATES_STORAGE_KEY = 'rank_mitra_candidates_v2_clean';
const CURRENT_USER_KEY = 'rank_mitra_current_user_v2';
const AUDIT_LOGS_KEY = 'rank_mitra_audit_logs_v2';
const LAST_CACHE_TIME_KEY = 'rank_mitra_last_cache_time_v2';

export function getCandidates(): CandidateRecord[] {
  try {
    const raw = localStorage.getItem(CANDIDATES_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to read candidates from storage', e);
    return [];
  }
}

export function saveCandidates(candidates: CandidateRecord[]): void {
  try {
    localStorage.setItem(CANDIDATES_STORAGE_KEY, JSON.stringify(candidates));
  } catch (e) {
    console.error('Failed to save candidates', e);
  }
}

export function clearAllCandidates(): void {
  try {
    localStorage.removeItem(CANDIDATES_STORAGE_KEY);
    localStorage.removeItem(CURRENT_USER_KEY);
    addAuditLog('CLEAR_ALL_DATA', 'All candidate submissions were cleared by administrator');
  } catch (e) {
    console.error('Failed to clear candidates', e);
  }
}

/**
 * Unique submission rule (UNIQUE(exam_id, roll_number))
 */
export function addCandidateSubmission(newCandidate: CandidateRecord): { success: boolean; error?: string } {
  const currentList = getCandidates();
  const existing = currentList.find(
    (c) => c.rollNumber.trim().toLowerCase() === newCandidate.rollNumber.trim().toLowerCase()
  );

  if (existing) {
    return {
      success: false,
      error: 'इस Roll Number की Answer Key पहले से दर्ज की जा चुकी है। (Duplicate Submission Not Allowed)',
    };
  }

  const updated = [newCandidate, ...currentList];
  saveCandidates(updated);
  setCurrentUserRoll(newCandidate.rollNumber);
  addAuditLog('NEW_SUBMISSION', `Roll Number: ${newCandidate.rollNumber}, Score: ${newCandidate.rawScore}`);

  return { success: true };
}

/**
 * Update allowed fields on existing profile (NO redundant insert)
 * Immutable fields (name, roll, examDate, shift, rawScore, correct, wrong) remain untouched.
 */
export function updateCandidateProfile(
  rollNumber: string,
  updatedFields: Partial<Pick<CandidateRecord, 'category' | 'gender' | 'qualifications' | 'exServiceman' | 'contractStatus'>>
): { success: boolean; error?: string } {
  const currentList = getCandidates();
  const index = currentList.findIndex((c) => c.rollNumber.trim().toLowerCase() === rollNumber.trim().toLowerCase());

  if (index === -1) {
    return { success: false, error: 'उम्मीदवार रिकॉर्ड नहीं मिला।' };
  }

  const existing = currentList[index];
  const updatedCandidate: CandidateRecord = {
    ...existing,
    category: updatedFields.category || existing.category,
    gender: updatedFields.gender || existing.gender,
    qualifications: updatedFields.qualifications || existing.qualifications,
    exServiceman: updatedFields.exServiceman !== undefined ? updatedFields.exServiceman : existing.exServiceman,
    contractStatus: updatedFields.contractStatus !== undefined ? updatedFields.contractStatus : existing.contractStatus,
    updatedAt: new Date().toISOString(),
  };

  currentList[index] = updatedCandidate;
  saveCandidates(currentList);
  addAuditLog('PROFILE_UPDATE', `Roll Number: ${rollNumber} profile updated`);

  return { success: true };
}

/**
 * Current user session roll number
 */
export function getCurrentUserRoll(): string | null {
  try {
    return localStorage.getItem(CURRENT_USER_KEY);
  } catch {
    return null;
  }
}

export function setCurrentUserRoll(roll: string): void {
  try {
    localStorage.setItem(CURRENT_USER_KEY, roll);
  } catch (e) {
    console.error(e);
  }
}

/**
 * Audit log management (Blueprint #46)
 */
export function getAuditLogs(): AuditLog[] {
  try {
    const raw = localStorage.getItem(AUDIT_LOGS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addAuditLog(action: string, details: string, adminUser: string = 'System/Admin'): void {
  try {
    const logs = getAuditLogs();
    const newLog: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      action,
      details,
      timestamp: new Date().toISOString(),
      adminUser,
    };
    localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify([newLog, ...logs].slice(0, 100)));
  } catch (e) {
    console.error(e);
  }
}

/**
 * 30-Minute Cache Timestamp indicator (Blueprint #34 & #68)
 */
export function getLastRefreshTime(): Date {
  try {
    const raw = localStorage.getItem(LAST_CACHE_TIME_KEY);
    if (!raw) {
      const now = new Date();
      localStorage.setItem(LAST_CACHE_TIME_KEY, now.toISOString());
      return now;
    }
    return new Date(raw);
  } catch {
    return new Date();
  }
}

export function updateRefreshTime(): void {
  try {
    localStorage.setItem(LAST_CACHE_TIME_KEY, new Date().toISOString());
  } catch (e) {
    console.error(e);
  }
}

/* ==========================================================================
 * Offline queue + sync bookkeeping (added with the database layer).
 *
 * localStorage stays the single source of truth for "what the user sees right
 * now"; the API is an overlay on top of it. A submission that cannot reach the
 * server is kept here and retried on the next load / manual refresh, so a
 * candidate never loses their answer-key analysis.
 * ========================================================================== */

const PENDING_KEY = 'rank_mitra_pending_v1';
const SYNC_REACHABILITY_KEY = 'rank_mitra_api_reachable_v1';
const SYNC_META_KEY = 'rank_mitra_sync_meta_v1';

export type PendingKind = 'submit' | 'patch' | 'delete';

export interface PendingSubmission {
  rollNumber: string;
  kind: PendingKind;
  payload: any;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

export interface SyncMeta {
  mode: 'live' | 'offline' | 'local';
  total: number;
  revision: number;
  lastSyncAt: string | null;
  lastError?: string;
  pending: number;
  synced: number;
}

/** Set by the repository after every server round-trip. */
export function apiReachableFlag(): boolean {
  try {
    return localStorage.getItem(SYNC_REACHABILITY_KEY) === '1';
  } catch {
    return false;
  }
}

export function setApiReachable(ok: boolean): void {
  try {
    localStorage.setItem(SYNC_REACHABILITY_KEY, ok ? '1' : '0');
  } catch {}
}

export function getPending(): PendingSubmission[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushPending(kind: PendingKind, rollNumber: string, payload: any): void {
  // newest first, and never queue the same roll+kind twice
  const list = getPending().filter((p) => !(p.rollNumber === rollNumber && p.kind === kind));
  list.unshift({
    rollNumber,
    kind,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(0, 200)));
  } catch {}
}

/** Remove a queued entry. Without `kind` every queued op for that roll goes. */
export function removePending(rollNumber: string, kind?: PendingKind): void {
  try {
    const list = getPending().filter(
      (p) => !(p.rollNumber === rollNumber && (kind === undefined || p.kind === kind))
    );
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {}
}

export function bumpPendingAttempt(rollNumber: string, error: string, kind?: PendingKind): void {
  const list = getPending();
  const item = list.find((p) => p.rollNumber === rollNumber && (kind === undefined || p.kind === kind));
  if (item) {
    item.attempts += 1;
    item.lastError = error;
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    } catch {}
  }
}

export function getSyncMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SyncMeta;
      if (parsed.mode === 'live' && !apiReachableFlag()) parsed.mode = 'offline';
      return { ...parsed, pending: getPending().length };
    }
  } catch {}
  return { mode: 'local', total: 0, revision: 0, lastSyncAt: null, pending: getPending().length, synced: 0 };
}

export function setSyncMeta(patch: Partial<SyncMeta>): SyncMeta {
  const next: SyncMeta = { ...getSyncMeta(), ...patch, pending: getPending().length };
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

/** Insert-or-replace a row in the local mirror (used after every server write). */
export function upsertLocalCandidate(candidate: import('../types').CandidateRecord): void {
  const list = getCandidates();
  const key = (r: string) => r.trim().toLowerCase();
  const index = list.findIndex((c) => key(c.rollNumber) === key(candidate.rollNumber));
  if (index === -1) saveCandidates([candidate, ...list]);
  else list[index] = { ...list[index], ...candidate };
  if (index !== -1) saveCandidates(list);
}

export function removeLocalCandidate(rollNumber: string): void {
  const key = (r: string) => r.trim().toLowerCase();
  saveCandidates(getCandidates().filter((c) => key(c.rollNumber) !== key(rollNumber)));
}
