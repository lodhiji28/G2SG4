#!/usr/bin/env node
/**
 * Single-process Node server.
 *
 *   node server.js
 *
 * - serves the built SPA from ./dist (if present)
 * - mounts the whole JSON API on /api/*  (same code as the Cloudflare Worker
 *   and the Vercel function)
 * - gzips JSON/HTML so a 300-row leaderboard costs ~4 KB instead of ~50 KB
 *
 * Used for: local dev, Docker, Render, Railway, Fly.io, any VPS.
 */

import http from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));

async function loadEnv() {
  try {
    const dotenv = (await import('dotenv')).default;
    for (const file of ['.env.local', '.env']) {
      const p = path.join(here, file);
      if (existsSync(p)) dotenv.config({ path: p, quiet: true });
    }
  } catch {
    /* dotenv optional */
  }
}

await loadEnv();

const { createContext, handleRequest } = await import('./core/handler.js');
const { toWebRequest, sendWebResponse } = await import('./runtime/node-adapter.js');

const ctx = await createContext({ env: process.env });
const DIST = path.resolve(here, ctx.cfg.distDir);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const compress = (buf, encoding) => {
  if (encoding === 'gzip') return gzipSync(buf, { level: 6 });
  try {
    return brotliCompressSync(buf, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 5,
        [constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
      },
    });
  } catch {
    return gzipSync(buf);
  }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/api')) {
      const { request } = await toWebRequest(req, { host: req.headers.host });
      const response = await handleRequest(request, ctx);
      await sendWebResponse(res, response, {
        gzip: (buf) => compress(buf, pickEncoding(req.headers['accept-encoding'])),
        method: req.method,
        acceptEncoding: req.headers['accept-encoding'] || '',
      });
      return;
    }

    if (ctx.cfg.serveStatic && existsSync(path.join(DIST, 'index.html'))) {
      if (await serveStatic(req, res, url.pathname)) return;
    }

    if (req.method === 'HEAD') {
      res.writeHead(200).end();
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found. Run `npm run build` to create ./dist, or use the API under /api.');
  } catch (err) {
    console.error('[server] request failed', err);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  }
});

/** @returns {Promise<boolean>} true when the file was served */
function serveStatic(req, res, pathname) {
  return new Promise((resolve) => {
    const safe = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(DIST, safe);
    if (!filePath.startsWith(DIST)) {
      res.writeHead(403).end('forbidden');
      resolve(true);
      return;
    }

    let isFile = existsSync(filePath) && statSync(filePath).isFile();
    if (!isFile && !path.extname(filePath)) {
      // SPA route -> index.html
      const index = path.join(DIST, 'index.html');
      if (existsSync(index)) {
        filePath = index;
        isFile = true;
      }
    }
    if (!isFile) {
      resolve(false);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const stat = statSync(filePath);
    const isHashedAsset = pathname.startsWith('/assets/');
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': isHashedAsset
        ? 'public, max-age=31536000, immutable'
        : ext === '.html'
        ? 'public, max-age=0, must-revalidate'
        : 'public, max-age=86400',
      etag: `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`,
    };

    if ((req.headers['if-none-match'] || '') === headers.etag) {
      res.writeHead(304, headers).end();
      resolve(true);
      return;
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, { ...headers, 'content-length': String(stat.size) }).end();
      resolve(true);
      return;
    }

    const acceptsBr = Boolean(pickEncoding(req.headers['accept-encoding'] || ''));
    if (acceptsBr && compressible(ext) && stat.size > 1024) {
      const out = compress(readFileSync(filePath), pickEncoding(req.headers['accept-encoding'] || ''));
      res.writeHead(200, {
        ...headers,
        'content-encoding': 'br',
        'content-length': String(out.length),
        vary: 'Accept-Encoding',
      });
      res.end(out);
      resolve(true);
      return;
    }

    res.writeHead(200, headers);
    createReadStream(filePath).pipe(res);
    res.on('close', () => resolve(true));
  });
}

function pickEncoding(acceptEncoding) {
  const ae = String(acceptEncoding || '');
  if (/\bbr\b/.test(ae)) return 'br';
  if (/\bgzip\b/.test(ae)) return 'gzip';
  return '';
}

function compressible(ext) {
  return ['.html', '.js', '.css', '.svg', '.json', '.txt', '.webmanifest'].includes(ext);
}

server.listen(ctx.cfg.port, '0.0.0.0', () => {
  const dbInfo = ctx.db.kind === 'sqlite' ? `sqlite (${ctx.cfg.sqlitePath}${ctx.db.inMemory ? ' [in-memory]' : ''})` : ctx.db.kind;
  console.log('┌──────────────────────────────────────────────────────────┐');
  console.log('│  Rank Mitra API + static server                          │');
  console.log('└──────────────────────────────────────────────────────────┘');
  console.log(`  http://localhost:${ctx.cfg.port}`);
  console.log(`  database : ${dbInfo}`);
  console.log(`  email    : ${ctx.email.provider}${ctx.email.configured ? '' : ' (not configured -> logs only)'}`);
  console.log(`  admin    : ${ctx.cfg.adminPassword ? 'enabled (ADMIN_PASSWORD set)' : 'DISABLED (set ADMIN_PASSWORD to enable)'}`);
  console.log(`  static   : ${existsSync(path.join(DIST, 'index.html')) ? DIST : 'dist/ not built (run: npm run build)'}`);
  console.log(`  exam id  : ${ctx.cfg.examId}`);
});

const shutdown = async () => {
  console.log('\n[server] closing');
  try {
    await ctx.db.close?.();
  } catch {}
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
