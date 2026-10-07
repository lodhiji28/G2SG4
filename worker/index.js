/**
 * Cloudflare Worker entry — the recommended free production target.
 *
 * Why this file exists: a Worker + D1 + static assets is ONE deploy
 * (`npm run deploy:cf`) and Cloudflare does not bill egress for Pages/Workers/
 * D1 on the free plan. That removes exactly the failure mode that paused the
 * Supabase project (origin egress 13.1 / 5 GB).
 *
 * Bindings used (see wrangler.toml):
 *   RANK_MITRA_DB  -> D1 database
 *   ASSETS         -> static assets (the Vite `dist/` build)
 */
import { createContext, handleRequest } from '../core/handler.js';

let bootstrap = null;

/** Worker isolate: build the context once per isolate, then reuse it. */
function getContext(env, ctx) {
  if (!bootstrap) {
    bootstrap = createContext({
      env: { ...env, DB_DRIVER: env.DB_DRIVER || 'd1' },
      bindings: env,
      waitUntil: (p) => ctx?.waitUntil?.(p),
    });
  }
  return bootstrap;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api')) {
      try {
        const app = await getContext(env, ctx);
        return await handleRequest(request, app);
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
          status: 500,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        });
      }
    }

    // Everything else: serve the built SPA from R2/Assets, with SPA fallback.
    const assets = env.ASSETS;
    if (assets) {
      const direct = await assets.fetch(request);
      if (direct.status !== 404) return direct;
      if (!url.pathname.includes('.')) {
        const indexUrl = new URL('/index.html', url);
        return assets.fetch(new Request(indexUrl.toString(), { headers: request.headers }));
      }
      return direct;
    }

    return new Response('Rank Mitra API is live. Deploy the frontend assets for the site.', { status: 200 });
  },

  /** Optional daily hygiene: trims audit/e-mail logs (configured in wrangler.toml). */
  async scheduled(controller, env) {
    const app = await getContext(env);
    const days = Number(env.DATA_RETENTION_DAYS || 120);
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
    try {
      await app.db.run('DELETE FROM audit_logs WHERE created_at < ?', [cutoff]);
      await app.db.run('DELETE FROM email_log WHERE created_at < ?', [cutoff]);
    } catch (e) {
      console.warn('[cron] retention failed', e?.message);
    }
  },
};
