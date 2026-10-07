/**
 * Node <-> Web-standard Request/Response bridge.
 *
 * Lets one handler implementation (`core/handler.js`) run unchanged inside
 * `node:http`, Vercel Serverless Functions and any other Node serverless
 * platform that hands you (req, res).
 */

const BODYLESS = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS']);

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {{ host?: string, protocol?: string }} [meta]
 * @returns {Promise<{request: Request, rawChunks: Buffer[]}>}
 */
export async function toWebRequest(req, meta = {}) {
  const host = meta.host || req.headers.host || 'localhost';
  const protocol = meta.protocol || 'http';
  const url = new URL(req.url || '/', `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }

  const method = (req.method || 'GET').toUpperCase();
  let body;
  if (!BODYLESS.has(method)) {
    const chunks = await readStream(req);
    if (chunks.length) body = chunks;
  }

  const request = new Request(url.toString(), {
    method,
    headers,
    body,
    // duplex is required by undici for stream/byte-body requests on Node 18+
    duplex: body ? 'half' : undefined,
  });

  return { request };
}

function readStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    stream.on('data', (c) => {
      size += c.length;
      if (size > 25 * 1024 * 1024) {
        reject(new Error('payload too large'));
        stream.destroy();
        return;
      }
      chunks.push(c);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * @param {import('node:http').ServerResponse} res
 */
export async function sendWebResponse(res, response, { gzip = null, method = 'GET', acceptEncoding = '' } = {}) {
  res.statusCode = response.status;
  res.statusMessage = response.statusText || '';

  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const encoding = pickEncoding(acceptEncoding);
  const acceptsEncoding = Boolean(gzip && encoding);

  let payload = Buffer.alloc(0);
  if (response.status !== 204 && response.status !== 304 && method !== 'HEAD') {
    const buf = await response.arrayBuffer();
    payload = Buffer.from(buf);
    if (gzip && acceptsEncoding && shouldCompress(headers['content-type'], payload.length)) {
      const out = gzip(payload);
      if (out.length < payload.length * 0.92) {
        payload = Buffer.from(out);
        headers['content-encoding'] = encoding;
        headers['content-length'] = String(payload.length);
        headers.vary = appendVary(headers.vary, 'Accept-Encoding');
      }
    }
  }

  if (!headers['content-length'] && payload.length) headers['content-length'] = String(payload.length);
  for (const [key, value] of Object.entries(headers)) {
    try {
      res.setHeader(key, value);
    } catch {}
  }
  res.end(payload.length ? payload : undefined);
}

/** br > gzip > identity — Vercel/Cloudflare compress at the edge, so this only
 *  matters for `node server.js` / Docker / Render deployments. */
function pickEncoding(acceptEncoding) {
  const ae = String(acceptEncoding || '');
  if (/\bbr\b/.test(ae)) return 'br';
  if (/\bgzip\b/.test(ae)) return 'gzip';
  return '';
}

function shouldCompress(contentType, size) {
  if (size < 1024) return false;
  if (!contentType) return false;
  return /json|text|html|csv|javascript|css|svg/i.test(contentType);
}

function appendVary(current, token) {
  if (!current) return token;
  return current.includes(token) ? current : `${current}, ${token}`;
}
