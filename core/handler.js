/**
 * The whole API, written against Web standards only (Request/Response/
 * crypto.subtle/fetch). The same module is mounted by:
 *   - server.js              (Node http: local dev, Docker, Render, Railway)
 *   - api/[...path].js        (Vercel Serverless Functions)
 *   - worker/index.js         (Cloudflare Worker -> also serves dist/ assets)
 */

import { createConfig } from './config.js';
import { createDriver } from './db/index.js';
import { sqliteSchema } from './db/schema.js';
import { EmailService, renderAdminAlert, renderRankReport, renderTestEmail, EMAIL_KINDS } from './email.js';
import {
  bulkUpsert,
  clearCandidates,
  countCandidates,
  deleteCandidate,
  getClaimHash,
  getCandidateByRoll,
  getRevision,
  insertCandidate,
  listAudit,
  listCandidates,
  rankSummary,
  setClaimToken,
  shiftStats,
  summaryStats,
  updateCandidateProfile,
  writeAudit,
} from './repo.js';
import {
  candidateId,
  clampInt,
  etagFor,
  issueAdminToken,
  json,
  normalizeRoll,
  nowIso,
  randomId,
  safeJson,
  sha256Hex,
  notModified,
  validateCandidate,
  verifyAdminToken,
  maskName,
} from './util.js';

const MAX_BODY_BYTES = 12 * 1024 * 1024; // 12 MB is plenty for a CSV import

export class AppContext {
  constructor({ cfg, db, email, waitUntil }) {
    this.cfg = cfg;
    this.db = db;
    this.email = email;
    this.waitUntil = waitUntil || (async (p) => p.catch(() => {}));
  }
}

/**
 * @param {{env?: Record<string,string|undefined>, bindings?: Record<string,any>, waitUntil?: Function}} options
 */
export async function createContext(options = {}) {
  const env = options.env || (typeof process !== 'undefined' ? process.env : {}) || {};
  const bindings = options.bindings || options.env || {};
  const cfg = createConfig(env);
  const db = await createDriver(cfg, bindings);

  // Self-healing schema for engines we control (sqlite file). Postgres/D1 use
  // the committed SQL files so that the DBA can review them first.
  if (db.kind === 'sqlite') {
    await db.exec(sqliteSchema());
  }

  const email = new EmailService(cfg, db);
  return new AppContext({ cfg, db, email, waitUntil: options.waitUntil });
}

/* ------------------------------------------------------------- middleware - */

const limiter = new Map();
function rateLimited(key, maxPerHour) {
  if (!maxPerHour || maxPerHour <= 0) return false;
  const now = Date.now();
  const windowStart = now - 3600_000;
  const list = (limiter.get(key) || []).filter((t) => t > windowStart);
  if (list.length >= maxPerHour) {
    limiter.set(key, list);
    return true;
  }
  list.push(now);
  limiter.set(key, list);
  return false;
}

function corsHeaders(request, cfg) {
  const origin = request.headers.get('origin') || '';
  const allow =
    cfg.allowedOrigins.includes('*') || cfg.allowedOrigins.includes(origin) ? origin || '*' : '';
  const headers = {
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, x-admin-token, x-claim-token, if-none-match',
    'access-control-max-age': '600',
  };
  if (allow) headers['access-control-allow-origin'] = allow;
  return headers;
}

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for') || '';
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'local';
}

async function isAdmin(ctx, request, url) {
  if (!ctx.cfg.adminPassword) return false;
  const header = request.headers.get('x-admin-token') || '';
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  // `?token=` is only ever consulted for the read-only admin CSV/JSON export,
  // because a browser download link cannot set headers.
  const query = url?.searchParams.get('token') || '';
  const token = header || bearer || query;
  if (!token) return false;
  return (await verifyAdminToken(ctx.cfg, token)) !== null;
}

async function readBody(request) {
  const len = Number(request.headers.get('content-length') || '0');
  if (len > MAX_BODY_BYTES) throw new HttpError(413, 'Request body is too large (max 12 MB).');
  const raw = await request.text();
  if (!raw) return {};
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (type.includes('application/json')) {
    const parsed = safeJson(raw, null);
    if (parsed === null) throw new HttpError(400, 'Invalid JSON body.');
    return parsed;
  }
  if (type.includes('text/csv') || type.includes('text/plain')) return { csv: raw };
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  const parsed = safeJson(raw, null);
  if (parsed) return parsed;
  throw new HttpError(415, `Unsupported content-type "${type || 'unknown'}".`);
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* --------------------------------------------------------------- router --- */

/**
 * @param {Request} request
 * @param {AppContext} ctx
 */
export async function handleRequest(request, ctx) {
  const url = new URL(request.url);
  const cors = corsHeaders(request, ctx.cfg);
  const withCors = (res) => {
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  };

  if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));

  if (!url.pathname.startsWith('/api')) {
    return withCors(json({ ok: false, error: 'not-found', path: url.pathname }, { status: 404 }));
  }

  const segments = url.pathname.replace(/^\/+api\/?/, '').split('/').filter(Boolean);
  const route = segments.join('/');

  try {
    return withCors(await routeRequest(ctx, request, url, route, segments));
  } catch (e) {
    if (e instanceof HttpError) {
      return withCors(json({ ok: false, error: e.message }, { status: e.status }));
    }
    console.error('[api] unhandled error', e);
    return withCors(
      json(
        { ok: false, error: 'सर्वर में समस्या हुई। कुछ क्षण बाद पुनः प्रयास करें।', detail: String(e?.message || e) },
        { status: 500 }
      )
    );
  }
}

async function routeRequest(ctx, request, url, route, segments) {
  const { cfg, db } = ctx;
  const method = request.method.toUpperCase();

  /* ---- health / config -------------------------------------------------- */
  if (route === 'health') {
    let dbOk = false;
    let rows = null;
    try {
      rows = await countCandidates(db, cfg.examId);
      dbOk = true;
    } catch (e) {
      console.warn('[api] health db check failed:', e.message);
    }
    return json({
      ok: true,
      time: nowIso(),
      database: { driver: db.kind, connected: dbOk, candidates: rows, revision: dbOk ? await getRevision(db) : null },
      email: ctx.email.status,
      examId: cfg.examId,
      version: '1.0.0',
    });
  }

  if (route === 'config') {
    return json(
      {
        ok: true,
        examId: cfg.examId,
        cacheSeconds: cfg.cacheMaxAge,
        liveDatabase: db.kind !== 'sqlite' || !db.inMemory,
        storage: db.kind,
        emailEnabled: ctx.email.configured && ctx.email.provider !== 'console',
        adminEnabled: Boolean(cfg.adminPassword),
      },
      { cache: 300 }
    );
  }

  /* ---- leaderboard / list ---------------------------------------------- */
  if (route === 'candidates' && method === 'GET') {
    const query = url.searchParams.toString();
    const rev = await revisionOf(db, cfg);
    const key = `list|${cfg.examId}|${rev}|${query}`;
    const etag = etagFor([cfg.examId, rev, query]);
    const cached = cacheTake(key, etag, request, cfg);
    if (cached) return cached.response;

    const count = await countCandidates(db, cfg.examId);

    const updatedSince = url.searchParams.get('updated_since');
    const rows = await listCandidates(db, {
      examId: cfg.examId,
      limit: clampInt(url.searchParams.get('limit'), 1, 2000, 300),
      offset: clampInt(url.searchParams.get('offset'), 0, 200000, 0),
      shiftNumber: url.searchParams.get('shift') || '',
      category: url.searchParams.get('category') || '',
      gender: url.searchParams.get('gender') || '',
      search: url.searchParams.get('q') || '',
      order: url.searchParams.get('order') || 'score',
      updatedSince: updatedSince || '',
    });

    const payload = {
      ok: true,
      examId: cfg.examId,
      revision: rev,
      total: count,
      count: rows.length,
      updatedAt: nowIso(),
      candidates: rows,
    };
    cachePut(key, etag, payload, cfg);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: MEM.bodies.get(key).headers.map(([k, v]) => [k, k === 'x-cache' ? 'MISS' : v]),
    });
  }

  /* ---- submit answer key ------------------------------------------------- */
  if (route === 'candidates' && method === 'POST') {
    const ip = clientIp(request);
    if (rateLimited(`submit:${ip}`, cfg.submitRatePerHour)) {
      throw new HttpError(429, `प्रति घंटा अधिकतम ${cfg.submitRatePerHour} प्रविष्टियाँ अनुमति हैं। कृपया बाद में प्रयास करें।`);
    }

    const body = await readBody(request);
    const payload = body.candidate || body;
    const check = validateCandidate({ ...payload, examId: undefined }, cfg);
    if (!check.ok) throw new HttpError(422, check.errors.join('; '));

    const candidate = check.value;
    if (payload.submittedAt) candidate.submittedAt = String(payload.submittedAt).slice(0, 40);

    // Claim token proves "this browser owns this roll number" without an auth system.
    const claimToken = randomId('clm-');
    const claimHash = await sha256Hex(`${claimToken}:${candidate.rollNumber}`);

    const result = await insertCandidate(db, candidate, claimHash);
    if (!result.inserted) {
      /*
       * Two different things look alike here, and candidates must not be scolded
       * for the harmless one:
       *   · same roll, same name/shift/counts  → they pasted twice (double click,
       *     another device, back-and-forth). Nothing is wrong: say so politely.
       *   · same roll, different numbers       → a real conflict; a row is never
       *     silently overwritten, so it needs the admin.
       */
      const e = result.existing || {};
      const sameNumbers =
        Number(e.rawScore) === Number(candidate.rawScore) &&
        Number(e.correct) === Number(candidate.correct) &&
        Number(e.wrong) === Number(candidate.wrong) &&
        Number(e.shiftNumber || 0) === Number(candidate.shiftNumber || 0);
      if (sameNumbers) {
        return json(
          {
            ok: false,
            alreadySaved: true,
            code: 'ALREADY_SAVED',
            error:
              'आपकी उत्तर कुंजी सर्वर पर पहले से सेव है — दोबारा सेव करने की ज़रूरत नहीं। ' +
              'अपनी रैंक देखने के लिए “मेरी रैंक” खोलें।',
            existing: {
              rollNumber: e.rollNumber,
              rawScore: e.rawScore,
              submittedAt: e.submittedAt,
            },
          },
          { status: 409 }
        );
      }
      return json(
        {
          ok: false,
          code: 'DUPLICATE',
          error:
            'इस Roll Number की Answer Key पहले से दर्ज है और अंक अलग हैं। अपने आप दोबारा सेव नहीं होगा — कृपया संचालक से संपर्क करें।',
          existing: {
            rollNumber: e.rollNumber,
            rawScore: e.rawScore,
            submittedAt: e.submittedAt,
          },
        },
        { status: 409 }
      );
    }
    invalidateCaches();

    await writeAudit(db, {
      id: randomId('log-'),
      action: 'NEW_SUBMISSION',
      details: `Roll ${candidate.rollNumber} | score ${candidate.rawScore} | shift ${candidate.shiftNumber} | ${candidate.sourceFormat}`,
      actor: 'public',
      ipHash: (await sha256Hex(ip)).slice(0, 12),
      createdAt: nowIso(),
    });

    const total = await countCandidates(db, cfg.examId);
    const rank = await rankSummary(db, candidate).catch(() => null);
    const stats = await summaryStats(db, cfg.examId).catch(() => null);

    // E-mail the analysis report (never blocks the response).
    const emailTask = maybeSendRankReport(ctx, candidate, rank, total);
    if (emailTask) ctx.waitUntil(emailTask);

    return json(
      {
        ok: true,
        created: true,
        candidate: publicView(candidate),
        claimToken,
        rank,
        stats,
        message: 'आपकी उत्तर कुंजी सफलतापूर्वक दर्ज हो गई।',
      },
      { status: 201 }
    );
  }

  /* ---- single candidate -------------------------------------------------- */
  if (segments[0] === 'candidates' && segments[1] && method === 'GET') {
    const roll = normalizeRoll(segments[1]);
    if (!roll) throw new HttpError(400, 'Invalid roll number.');
    const admin = await isAdmin(ctx, request, url);
    const claim = request.headers.get('x-claim-token') || url.searchParams.get('claim') || '';
    const stored = await getClaimHash(db, candidateId(cfg.examId, roll)).catch(() => null);
    const ownsIt = Boolean(claim && stored?.claim_token_hash && (await sha256Hex(`${claim}:${roll}`)) === stored.claim_token_hash);

    const c = await getCandidateByRoll(db, cfg.examId, roll, { includePrivate: admin || ownsIt });
    if (!c) throw new HttpError(404, 'यह रोल नंबर अभी दर्ज नहीं है।');

    const out = { ok: true, candidate: c, rank: await rankSummary(db, c).catch(() => null) };
    if (ownsIt || admin) {
      out.answerPattern = c.answerPattern || '';
      out.email = c.email || '';
      if (!admin) delete out.candidate.candidateNamePrivate;
    } else {
      delete out.candidate.answerPattern;
    }
    return json(out, { cache: 60 });
  }

  /* ---- profile update ---------------------------------------------------- */
  if (segments[0] === 'candidates' && segments[1] && method === 'PATCH') {
    const roll = normalizeRoll(segments[1]);
    const admin = await isAdmin(ctx, request, url);
    if (!admin) {
      const claim = request.headers.get('x-claim-token') || '';
      const stored = await getClaimHash(db, candidateId(cfg.examId, roll));
      if (!stored?.claim_token_hash) throw new HttpError(403, 'इस रिकॉर्ड को बदलने का अधिकार नहीं है।');
      const hash = await sha256Hex(`${claim}:${roll}`);
      if (hash !== stored.claim_token_hash) throw new HttpError(401, 'सत्यापन विफल (claim token गलत है)।');
    }
    const body = await readBody(request);
    const res = await updateCandidateProfile(db, cfg.examId, roll, body);
    invalidateCaches();
    if (!res.updated) throw new HttpError(404, 'रिकॉर्ड नहीं मिला।');
    await writeAudit(db, {
      id: randomId('log-'),
      action: 'PROFILE_UPDATE',
      details: `Roll ${roll} updated by ${admin ? 'admin' : 'owner'}`,
      actor: admin ? 'admin' : 'owner',
      createdAt: nowIso(),
    });
    const c = await getCandidateByRoll(db, cfg.examId, roll, { includePrivate: admin });
    return json({ ok: true, candidate: c, rank: await rankSummary(db, c).catch(() => null) });
  }

  /* ---- delete own record (or admin) -------------------------------------- */
  if (segments[0] === 'candidates' && segments[1] && method === 'DELETE') {
    const roll = normalizeRoll(segments[1]);
    const admin = await isAdmin(ctx, request, url);
    if (!admin) {
      if (!cfg.allowSelfDelete) {
        throw new HttpError(
          403,
          'उम्मीदवार स्वयं प्रविष्टि हटा नहीं सकते (नियम #43)। गलती सुधारने हेतु संचालक से संपर्क करें — वे प्रशासक पैनल से हटा/सुधार कर सकेंगे।'
        );
      }
      const claim = request.headers.get('x-claim-token') || '';
      const stored = await getClaimHash(db, candidateId(cfg.examId, roll));
      if (!stored?.claim_token_hash) throw new HttpError(403, 'हटाने का अधिकार नहीं है।');
      if ((await sha256Hex(`${claim}:${roll}`)) !== stored.claim_token_hash) throw new HttpError(401, 'सत्यापन विफल।');
    }
    const res = await deleteCandidate(db, cfg.examId, roll);
    invalidateCaches();
    if (!res.deleted) throw new HttpError(404, 'रिकॉर्ड नहीं मिला।');
    await writeAudit(db, {
      id: randomId('log-'),
      action: 'DELETE_SUBMISSION',
      details: `Roll ${roll} removed by ${admin ? 'admin' : 'owner'}`,
      actor: admin ? 'admin' : 'owner',
      createdAt: nowIso(),
    });
    return json({ ok: true, deleted: res.deleted });
  }

  /* ---- stats ------------------------------------------------------------- */
  if (route === 'stats') {
    const rev = await revisionOf(db, cfg);
    const etag = etagFor(['stats', cfg.examId, rev]);
    const statsKey = `stats|${cfg.examId}|${rev}`;
    const hit = cacheTake(statsKey, etag, request, cfg);
    if (hit) return hit.response;
    if (request.headers.get('if-none-match') === etag) return notModified(etag);
    const [summary, shifts] = await Promise.all([summaryStats(db, cfg.examId), shiftStats(db, cfg.examId)]);
    const statsPayload = { ok: true, revision: rev, summary, shifts };
    cachePut(statsKey, etag, statsPayload, cfg);
    return new Response(JSON.stringify(statsPayload), {
      status: 200,
      headers: MEM.bodies.get(statsKey).headers.map(([k, v]) => [k, k === 'x-cache' ? 'MISS' : v]),
    });
  }

  /* ---- my rank batch: resolve several rolls at once (bulk upload) -------- */
  if (route === 'rank/batch' && method === 'POST') {
    const body = await readBody(request);
    const rolls = Array.isArray(body.rolls) ? body.rolls.slice(0, 200) : [];
    const out = [];
    for (const r of rolls) {
      const c = await getCandidateByRoll(db, cfg.examId, normalizeRoll(r));
      if (!c) continue;
      out.push({ rollNumber: c.rollNumber, rank: await rankSummary(db, c).catch(() => null) });
    }
    return json({ ok: true, items: out }, { cache: 60 });
  }

  /* ---- admin ------------------------------------------------------------- */
  if (route === 'admin/login' && method === 'POST') {
    const body = await readBody(request);
    const ip = clientIp(request);
    if (rateLimited(`login:${ip}`, 10)) throw new HttpError(429, 'बहुत अधिक प्रयास। 1 घंटे बाद पुनः प्रयास करें।');
    if (!cfg.adminPassword) {
      throw new HttpError(501, 'सर्वर पर ADMIN_PASSWORD सेट नहीं है — इसलिए admin पैनल निष्क्रिय है।');
    }
    const given = String(body.password || '');
    const expected = cfg.adminPassword;
    if (given.length !== expected.length) {
      await timingBurn();
      throw new HttpError(401, 'पासवर्ड गलत है।');
    }
    let diff = 0;
    for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) throw new HttpError(401, 'पासवर्ड गलत है।');
    const token = await issueAdminToken(cfg, 'admin');
    await writeAudit(db, {
      id: randomId('log-'),
      action: 'ADMIN_LOGIN',
      details: 'admin session started',
      actor: 'admin',
      ipHash: (await sha256Hex(ip)).slice(0, 12),
      createdAt: nowIso(),
    });
    return json({ ok: true, token, expiresInHours: cfg.adminTokenTtlHours });
  }

  if (route.startsWith('admin/')) {
    if (!(await isAdmin(ctx, request, url))) throw new HttpError(401, 'केवल प्रशासक (admin token आवश्यक)।');

    if (route === 'admin/audit' && method === 'GET') {
      const logs = await listAudit(db, clampInt(url.searchParams.get('limit'), 1, 500, 100));
      return json({ ok: true, logs });
    }

    if (route === 'admin/clear' && method === 'POST') {
      const body = await readBody(request);
      if (String(body.confirm || '') !== 'DELETE ALL') {
        throw new HttpError(400, 'पुष्टि हेतु ठीक "DELETE ALL" लिखें।');
      }
      const res = await clearCandidates(db, cfg.examId);
      await writeAudit(db, {
        id: randomId('log-'),
        action: 'CLEAR_ALL_DATA',
        details: `${res.deleted} rows removed by admin`,
        actor: 'admin',
        createdAt: nowIso(),
      });
      return json({ ok: true, deleted: res.deleted });
    }

    if (route === 'admin/import' && method === 'POST') {
      // imported rows change every aggregate; drop the memoised bodies up front
      invalidateCaches();
      const body = await readBody(request);
      let rows = Array.isArray(body.rows) ? body.rows : null;
      if (!rows && (body.csv || body.text)) rows = parseCsvExport(String(body.csv ?? body.text));
      if (!rows?.length) throw new HttpError(400, 'कोई डेटा नहीं मिला (rows या csv फ़ील्ड भेजें)।');
      if (rows.length > 5000) throw new HttpError(413, 'एक बार में अधिकतम 5000 पंक्तियाँ।');

      let prepared = 0;
      const preparedRows = [];
      const errors = [];
      for (const row of rows) {
        const check = validateCandidate(normalizeImportedRow(row), cfg);
        if (check.ok) {
          preparedRows.push(check.value);
          prepared++;
        } else {
          errors.push({ roll: row.rollNumber || row['Roll Number'], error: check.errors.join('; ') });
        }
      }
      const res = await bulkUpsert(db, cfg.examId, preparedRows);
      await writeAudit(db, {
        id: randomId('log-'),
        action: 'ADMIN_IMPORT',
        details: `imported ${res.inserted}, skipped ${res.skipped}, invalid ${errors.length}`,
        actor: 'admin',
        createdAt: nowIso(),
      });
      return json({ ok: true, prepared, ...res, invalid: errors.slice(0, 20) });
    }

    if (route === 'admin/export' && method === 'GET') {
      const format = (url.searchParams.get('format') || 'csv').toLowerCase();
      const rows = await listCandidates(db, { examId: cfg.examId, limit: 2000 });
      const withPrivate = url.searchParams.get('private') === '1';
      const full = [];
      for (const r of rows) {
        const one = await getCandidateByRoll(db, cfg.examId, r.rollNumber, { includePrivate: withPrivate });
        if (one) full.push(one);
      }
      if (format === 'json') {
        return new Response(JSON.stringify(full, null, 2), {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'content-disposition': `attachment; filename="rank-mitra-${Date.now()}.json"`,
            'cache-control': 'no-store',
          },
        });
      }
      const csv = toCsv(full);
      return new Response('\uFEFF' + csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="rank-mitra-${Date.now()}.csv"`,
          'cache-control': 'no-store',
        },
      });
    }

    if (route === 'admin/email-test' && method === 'POST') {
      const body = await readBody(request);
      const to = String(body.to || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.\w{2,}$/.test(to)) throw new HttpError(400, 'मान्य ई-मेल पता दर्ज करें।');
      const t = renderTestEmail(to);
      const res = await ctx.email.send({ to, ...t, kind: EMAIL_KINDS.TEST });
      return json({ ok: Boolean(res.ok), provider: ctx.email.provider, result: res });
    }

    if (route === 'admin/revoke-claim' && method === 'POST') {
      const body = await readBody(request);
      const roll = normalizeRoll(body.rollNumber);
      if (!roll) throw new HttpError(400, 'rollNumber आवश्यक');
      await setClaimToken(db, candidateId(cfg.examId, roll), null);
      return json({ ok: true, message: 'claim token हटा दिया गया; अब कोई भी इस रिकॉर्ड का मालिक नहीं (आप admin token से बदल सकते हैं)।' });
    }

    throw new HttpError(404, `अज्ञात admin पथ: ${route}`);
  }

  /* ---- manual e-mail trigger (owner or admin) ---------------------------- */
  if (route === 'email/report' && method === 'POST') {
    const body = await readBody(request);
    const roll = normalizeRoll(body.rollNumber);
    const admin = await isAdmin(ctx, request, url);
    const claim = request.headers.get('x-claim-token') || '';
    const stored = await getClaimHash(db, candidateId(cfg.examId, roll));
    const owns = claim && stored?.claim_token_hash && (await sha256Hex(`${claim}:${roll}`)) === stored.claim_token_hash;
    if (!admin && !owns) throw new HttpError(401, 'सत्यापन विफल।');

    const c = await getCandidateByRoll(db, cfg.examId, roll, { includePrivate: true });
    if (!c) throw new HttpError(404, 'रिकॉर्ड नहीं मिला।');
    const to = String(body.email || c.email || '').trim().toLowerCase();
    if (!to) throw new HttpError(400, 'ई-मेल पता आवश्यक है।');
    const rank = await rankSummary(db, c).catch(() => null);
    const total = await countCandidates(db, cfg.examId);
    const t = renderRankReport({
      candidate: c,
      rank,
      shift: `शिफ्ट ${c.shiftNumber}`,
      percentileNote: `प्लेटफ़ॉर्म पर कुल ${total} प्रविष्टियाँ हैं। यह आँकड़े स्वयं उम्मीदवारों द्वारा जमा की गई उत्तर कुंजियों पर आधारित हैं।`,
    });
    const res = await ctx.email.send({ to, ...t, kind: EMAIL_KINDS.REPORT });
    return json({ ok: Boolean(res.ok), result: res, emailEnabled: ctx.email.configured && ctx.email.provider !== 'console' });
  }

  throw new HttpError(404, `अज्ञात API पथ: /api/${route}`);
}

/* -------------------------------------------------------------- helpers --- */

async function maybeSendRankReport(ctx, candidate, rank, total) {
  if (!candidate.email) return null;
  const job = async () => {
    if (!ctx.email.configured) return;
    const t = renderRankReport({
      candidate,
      rank,
      shift: `शिफ्ट ${candidate.shiftNumber}`,
      percentileNote: `इस समय प्लेटफ़ॉर्म पर कुल ${total} उम्मीदवारों का डेटा है।`,
    });
    await ctx.email.send({ to: candidate.email, ...t, kind: EMAIL_KINDS.REPORT });

    if (ctx.cfg.adminEmail) {
      const a = renderAdminAlert(candidate, total);
      await ctx.email.send({ to: ctx.cfg.adminEmail, ...a, kind: EMAIL_KINDS.ADMIN_ALERT });
    }
  };
  return job().catch((e) => console.warn('[email] failed:', e.message));
}

/** Strip private fields before anything reaches a public client. */
function publicView(c) {
  const clone = { ...c };
  delete clone.candidateNamePrivate;
  delete clone.email;
  delete clone.answerPattern;
  delete clone.claimTokenHash;
  delete clone.claim_token_hash;
  delete clone.fileName;
  delete clone.fileBytes;
  clone.confidence = c.parseConfidence || c.confidence || 'WARNING';
  return clone;
}

/**
 * Revision-keyed response cache (per instance).
 *
 * The leaderboard payload is byte-identical for every visitor until somebody
 * submits, and a submit is exactly what bumps `meta.rev`. So the serialized body
 * can be served from memory, keyed by that revision, while the revision itself is
 * re-read at most every REV_TTL_MS. Net effect on a free database tier:
 *
 *   N visitors  →  ~1 tiny `meta` read per REV_TTL_MS per instance
 *              →  1 full leaderboard read only when the data actually changed
 *              →  everyone else gets a cached body or an ETag 304 (0 bytes)
 *
 * That is what keeps egress flat when a Telegram/WhatsApp link brings a spike.
 * A new submission becomes visible within REV_TTL_MS — deliberately short, so the
 * long HTTP cache never makes the app feel stale.
 */
const REV_TTL_MS = 20_000;
const MEM = { rev: { value: null, at: 0 }, bodies: new Map() };

async function revisionOf(db, cfg) {
  const now = Date.now();
  if (MEM.rev.value !== null && now - MEM.rev.at < REV_TTL_MS) return MEM.rev.value;
  const rev = await getRevision(db);
  MEM.rev = { value: rev, at: now };
  void cfg;
  return rev;
}

function cacheTake(key, etag, request, cfg) {
  const hit = MEM.bodies.get(key);
  if (hit) {
    if (Date.now() - hit.at <= Math.max(60, cfg.cacheMaxAge) * 1000) {
      if (request.headers.get('if-none-match') === etag) return { response: notModified(etag) };
      return { response: new Response(hit.body, { status: 200, headers: hit.headers }) };
    }
    MEM.bodies.delete(key);
  }
  return null;
}

function cachePut(key, etag, payload, cfg) {
  const headers = [
    ['content-type', 'application/json; charset=utf-8'],
    [
      'cache-control',
      `public, max-age=${cfg.cacheMaxAge}, s-maxage=${cfg.cacheMaxAge}, stale-while-revalidate=${Math.max(60, cfg.cacheMaxAge)}`,
    ],
    ['etag', etag],
    ['vary', 'Origin, Accept-Encoding'],
    ['x-cache', 'HIT-eligible'],
  ];
  MEM.bodies.set(key, { body: JSON.stringify(payload), headers, etag, at: Date.now() });
  // Distinct query strings are unbounded (search terms), so keep the map small.
  if (MEM.bodies.size > 40) {
    const oldest = [...MEM.bodies.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) MEM.bodies.delete(oldest[0]);
  }
}

/** Called after any write so the next visitor cannot be served a stale body. */
function invalidateCaches() {
  MEM.rev = { value: null, at: 0 };
  MEM.bodies.clear();
}

async function timingBurn() {
  await new Promise((r) => setTimeout(r, 30));
}

export const CSV_HEADERS = [
  'Roll Number',
  'Candidate Name',
  'Exam Date',
  'Shift Number',
  'Category',
  'Gender',
  'Total Questions',
  'Attempted',
  'Correct',
  'Wrong',
  'Raw Score',
  'Accuracy %',
  'Qualifications',
  'Post Preferences',
  'Ex-Serviceman',
  'Contract',
  'Submitted At',
];

function toCsv(rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_HEADERS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.rollNumber,
        r.candidateNamePrivate || r.candidateNamePublic,
        r.examDate,
        r.shiftNumber,
        r.category,
        r.gender,
        r.totalQuestions,
        r.attempted,
        r.correct,
        r.wrong,
        r.rawScore,
        r.accuracy,
        (r.qualifications || []).join('; '),
        (r.postPreferences || []).join('; '),
        r.exServiceman ? 'Yes' : 'No',
        r.contractStatus ? 'Yes' : 'No',
        r.submittedAt,
      ]
        .map(esc)
        .join(',')
    );
  }
  return lines.join('\r\n');
}

/** Minimal RFC-4180-ish CSV reader (quotes + CRLF tolerant). */
export function parseCsvExport(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((f) => f !== '')) rows.push(row);
  }
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, idx) => (obj[h] = r[idx]));
    return obj;
  });
}

function normalizeImportedRow(row) {
  const get = (...keys) => {
    for (const k of keys) {
      const v = row[k] ?? row[String(k).toLowerCase()];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return '';
  };
  const yes = (v) => v === true || ['yes', '1', 'true', 'haan', 'y'].includes(String(v).toLowerCase().trim());
  const quals = get('qualifications');
  const posts = get('post preferences', 'post_preferences', 'postPreferences');
  return {
    rollNumber: get('roll number', 'roll_number', 'rollNumber', 'roll'),
    candidateNamePrivate: get('candidate name', 'candidate_name_private', 'name', 'candidateName') || maskName(String(get('candidate name public', 'candidate_name_public'))),
    examDate: get('exam date', 'exam_date', 'examDate'),
    shiftNumber: get('shift number', 'shift_number', 'shiftNumber', 'shift'),
    category: get('category'),
    gender: get('gender'),
    totalQuestions: get('total questions', 'total_questions', 'totalQuestions'),
    correct: get('correct'),
    wrong: get('wrong'),
    qualifications: quals
      ? String(quals)
          .split(/;|\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    postPreferences: posts
      ? String(posts)
          .split(/[;|,\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    exServiceman: yes(get('ex-serviceman', 'ex_serviceman', 'exServiceman')),
    contractStatus: yes(get('contract', 'contract_status', 'contractStatus')),
    submittedAt: get('submitted at', 'submitted_at', 'submittedAt') || undefined,
    sourceFormat: 'ADMIN_IMPORT',
    confidence: 'VERIFIED',
  };
}
