/**
 * Rank Mitra API — Netlify Function.
 *
 * One deploy now carries the whole product: `dist/` (static SPA) + this function
 * (the shared database). No second host, no CORS, no second free tier to manage.
 *
 * It is a ~40-line wrapper. `core/handler.js` holds every rule (validation,
 * duplicate protection, masking, ranking, CSV, audit, e-mail) and is the same
 * file the Node server and the Cloudflare Worker use — so behaviour can never
 * drift between hosts.
 *
 * Environment (Site settings → Environment variables, or `netlify env:set`):
 *   DATABASE_URL   Supabase/Neon **pooler** connection string (see README —
 *                  always the :5432 session pooler, never the direct IPv6-only
 *                  endpoint, or the function hangs on connect)
 *   ADMIN_PASSWORD optional; enables the admin panel login
 *   SMTP_*         optional; without them e-mail stays on the console provider
 *
 * Netlify needs `node-compat` nothing special here — the handler is written
 * against web standards (Request/Response, crypto.subtle) plus the `pg` package,
 * which is bundled with the function at build time.
 */

import { createContext, handleRequest } from '../../core/handler.js';

/** Built once per container, reused across invocations (warm starts). */
let ctxPromise = null;

function getContext() {
  if (!ctxPromise) {
    ctxPromise = createContext({ env: process.env }).catch((e) => {
      ctxPromise = null; // a failed boot must be retryable, not cached forever
      throw e;
    });
  }
  return ctxPromise;
}

/**
 * Netlify delivers the rewritten path (`/.netlify/functions/api/candidates`);
 * the shared handler routes on `/api/...`. Normalise so the same handler works
 * whether it is invoked directly, through the redirect, or from `netlify serve`.
 */
function toApiUrl(rawUrl) {
  const url = new URL(rawUrl);
  const fn = url.pathname.match(/^\/\.netlify\/functions\/api(?:\/(.*))?$/);
  if (fn) {
    url.pathname = `/api${fn[1] ? `/${fn[1]}` : ''}`;
    return url.toString();
  }
  if (url.pathname.startsWith('/api')) return rawUrl;
  url.pathname = `/api${url.pathname === '/' ? '' : url.pathname}`;
  return url.toString();
}

const BODYLESS = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS']);

export default async (request) => {
  const method = (request.method || 'GET').toUpperCase();

  try {
    const ctx = await getContext();
    const url = toApiUrl(request.url);
    const scoped =
      url === request.url
        ? request
        : new Request(url, {
            method,
            headers: request.headers,
            body: BODYLESS.has(method) ? null : request.body,
            duplex: BODYLESS.has(method) ? undefined : 'half',
          });
    return await handleRequest(scoped, ctx);
  } catch (e) {
    console.error('[netlify] api error', e);
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'सर्वर से जुड़ा नहीं जा सका। कुछ क्षण बाद पुनः प्रयास करें।',
        detail: String((e && e.message) || e).slice(0, 300),
      }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }
    );
  }
};
