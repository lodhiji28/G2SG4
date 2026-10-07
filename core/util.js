/**
 * Small shared helpers: ids, hashing, signed admin tokens, ETag, validation.
 * Uses only Web APIs (crypto.subnet / TextEncoder) so the exact same file runs
 * in Node 20+, Vercel functions and Cloudflare Workers.
 */

const te = new TextEncoder();

/* ------------------------------------------------------------------ ids --- */

export function randomId(prefix = '') {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `${prefix}${Date.now().toString(36)}${hex}`;
}

export function nowIso() {
  return new Date().toISOString();
}

/** Stable "id" for a candidate row: examId + normalised roll number. */
export function candidateId(examId, rollNumber) {
  return `cand-${examId}-${normalizeRoll(rollNumber)}`.replace(/[^a-zA-Z0-9._-]/g, '-');
}

export function normalizeRoll(roll) {
  return String(roll || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

/* --------------------------------------------------------------- hashes --- */

export async function sha256Hex(input) {
  const data = te.encode(String(input));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return bufToHex(digest);
}

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(secret, data) {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    te.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  return globalThis.crypto.subtle.sign('HMAC', key, te.encode(data));
}

/* ------------------------------------------------------- admin token ------ */

/**
 * Minimal stateless session token (HMAC signed, base64url payload).
 * Avoids pulling a JWT dependency into a free-tier deployment.
 */
export async function issueAdminToken(cfg, actor = 'admin') {
  const payload = {
    a: actor,
    e: Date.now() + cfg.adminTokenTtlHours * 3600_000,
    n: randomId('t'),
  };
  const body = base64urlEncodeString(JSON.stringify(payload));
  const sig = base64urlEncodeBuf(await hmac(cfg.authSecret, body));
  return `${body}.${sig}`;
}

export async function verifyAdminToken(cfg, token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = base64urlEncodeBuf(await hmac(cfg.authSecret, body));
  if (!safeEqual(expected, sig)) return null;
  try {
    const payload = JSON.parse(base64urlDecodeToString(body));
    if (!payload.e || payload.e < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function base64urlEncodeString(s) {
  return base64urlFromBytes(te.encode(s));
}
export function base64urlEncodeBuf(buf) {
  return base64urlFromBytes(new Uint8Array(buf));
}
function base64urlFromBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function base64urlDecodeToString(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* --------------------------------------------------------------- misc ----- */

export function hashString(input) {
  // FNV-1a, fast, good enough for cache keys / ETags.
  let h = 0x811c9dc5;
  const s = String(input);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function etagFor(parts) {
  return `"${hashString(Array.isArray(parts) ? parts.join('|') : String(parts))}"`;
}

export function safeJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value === null || value === undefined || value === '' ? fallback : value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Response helper with compression-friendly headers. */
export function json(body, init = {}) {
  const { status = 200, headers = {}, cache = 0, etag } = init;
  const h = new Headers(headers);
  h.set('content-type', 'application/json; charset=utf-8');
  if (cache > 0) {
    h.set('cache-control', `public, max-age=${cache}, s-maxage=${cache}, stale-while-revalidate=${Math.max(60, cache)}`);
  } else {
    h.set('cache-control', 'no-store');
  }
  if (etag) h.set('etag', etag);
  h.set('vary', 'Origin, Accept-Encoding');
  return new Response(body === null || body === undefined ? '' : JSON.stringify(body), { status, headers: h });
}

export function notModified(etag) {
  return new Response(null, {
    status: 304,
    headers: { etag: etag || '', 'cache-control': 'public, max-age=60, stale-while-revalidate=1800' },
  });
}

export function text(body, init = {}) {
  return new Response(body, {
    status: init.status || 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...(init.headers || {}) },
  });
}

/* ------------------------------------------------------- validation ------- */

const CATEGORIES = ['UR', 'OBC', 'SC', 'ST', 'EWS'];
const GENDERS = ['Male', 'Female', 'Other'];

export function validateCandidate(input, cfg) {
  const errors = [];
  const roll = normalizeRoll(input.rollNumber);
  if (!roll) errors.push('rollNumber is required');
  if (roll && !/^[0-9A-Z]{4,20}$/.test(roll)) errors.push('rollNumber looks invalid (4-20 letters/digits)');

  const name = String(input.candidateNamePrivate || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2) errors.push('candidateName is required');
  if (name.length > 80) errors.push('candidateName is too long');

  const category = String(input.category || '').toUpperCase();
  if (!CATEGORIES.includes(category)) errors.push('category must be one of ' + CATEGORIES.join('/'));

  const gender = String(input.gender || '');
  if (!GENDERS.includes(gender)) errors.push('gender must be one of ' + GENDERS.join('/'));

  const totalQuestions = clampInt(input.totalQuestions, 1, 500, 200);
  const correct = clampInt(input.correct, 0, totalQuestions, 0);
  const wrong = clampInt(input.wrong, 0, totalQuestions, 0);
  if (correct + wrong > totalQuestions) errors.push('correct + wrong cannot exceed totalQuestions');

  const shiftNumber = clampInt(input.shiftNumber, 1, 22, 1);

  const emailRaw = String(input.email || '').trim();
  let email = '';
  if (emailRaw) {
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(emailRaw)) errors.push('email address is not valid');
    else if (emailRaw.length > 160) errors.push('email is too long');
    else email = emailRaw.toLowerCase();
  }

  const qualifications = Array.isArray(input.qualifications)
    ? input.qualifications.map((q) => String(q).slice(0, 120)).filter(Boolean).slice(0, 20)
    : [];

  // Ordered post codes ("001", "014", …). Optional in phase 1 (blueprint #12.1),
  // so a bad code is dropped rather than rejecting the whole submission.
  const postPreferences = Array.isArray(input.postPreferences)
    ? input.postPreferences
        .map((x) => String(x).trim())
        .filter((x) => /^[0-9]{3}$/.test(x))
        .filter((x, i, a) => a.indexOf(x) === i)
        .slice(0, 100)
    : [];

  if (errors.length) return { ok: false, errors };

  const attempted = correct + wrong;
  const rawScore = Number((correct - wrong * 0.25).toFixed(2));
  const accuracy = attempted > 0 ? Number(((correct / attempted) * 100).toFixed(2)) : 0;
  const unattempted = Math.max(0, totalQuestions - attempted);
  const publicName = maskName(name);

  return {
    ok: true,
    value: {
      id: input.id || candidateId(cfg.examId, roll),
      examId: cfg.examId,
      rollNumber: roll,
      candidateNamePrivate: name,
      candidateNamePublic: publicName,
      email,
      examDate: String(input.examDate || '').slice(0, 40),
      shiftId: input.shiftId || `shift-${String(shiftNumber).padStart(2, '0')}`,
      shiftNumber,
      totalQuestions,
      attempted,
      unattempted,
      correct,
      wrong,
      rawScore,
      accuracy,
      category,
      gender,
      exServiceman: !!input.exServiceman,
      contractStatus: !!input.contractStatus,
      qualifications,
      postPreferences,
      sourceFormat: String(input.sourceFormat || 'MANUAL').slice(0, 40),
      parseConfidence: ['VERIFIED', 'WARNING', 'FAILED'].includes(input.confidence) ? input.confidence : 'WARNING',
      /*
       * DATA MINIMISATION (owner's rule): the uploaded answer key is a source to
       * read from, never a document to keep. We store identity + shift + the
       * derived counts (correct / wrong / attempted / unattempted / score) and
       * nothing else. Any per-question pattern or local file reference a client
       * happens to send is dropped here, at the single choke point, so it can
       * never reach the database even if some future client forgets.
       *
       * Set STORE_QUESTION_PATTERN=1 only if you decide to keep the derived
       * 0/1/2 pattern (e.g. to re-draw a per-question report server side).
       */
      fileName: '',
      fileBytes: 0,
      answerPattern:
        cfg && cfg.storeQuestionPattern
          ? String(input.answerPattern || '').replace(/[^012]/g, '').slice(0, 500)
          : '',
      submittedAt: input.submittedAt || nowIso(),
      updatedAt: nowIso(),
    },
  };
}

/** "RAHUL KUMAR SINGH" -> "RAHUL K****" (privacy on public screens) */
export function maskName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'अभ्यर्थी';
  if (parts.length === 1) return `${parts[0].slice(0, 3)}•••`;
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}****`;
}
