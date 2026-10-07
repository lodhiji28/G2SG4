/**
 * Vercel Serverless entry point (catch-all: every /api/* request lands here).
 * Node 20 runtime — `pg` is bundled, Web APIs (fetch/crypto) are native.
 */
import { createContext, handleRequest } from '../core/handler.js';
import { toWebRequest, sendWebResponse } from '../runtime/node-adapter.js';

let bootstrap = null;

function getContext() {
  if (!bootstrap) bootstrap = createContext({ env: process.env });
  return bootstrap;
}

export default async function handler(req, res) {
  const ctx = await getContext();
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const { request } = await toWebRequest(req, { host, protocol: proto });

  const response = await handleRequest(request, ctx);
  // Vercel's own CDN already brotli-compresses text responses.
  await sendWebResponse(res, response, { method: req.method });
}

export const config = {
  api: { bodyParser: false },
  runtime: 'nodejs22.x',
};
