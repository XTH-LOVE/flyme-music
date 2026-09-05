/**
 * Pure-logic handlers for the 5 /api endpoints.
 *
 * Source of truth: the dev-only middlewares in vite.config.ts. This module is
 * consumed by the thin Vercel serverless wrappers in api/ (production web
 * deployment) and by the temporary local smoke test server/_smoke.mjs.
 *
 * IMPORTANT: on Vercel, `req.url` is the FULL request path (e.g.
 * "/api/proxy?url=..."), unlike vite dev middleware where the mount prefix is
 * stripped before the handler sees it. All helpers below therefore work on the
 * full URL.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  isAllowedRequest,
  rateLimit,
  RATE_LIMITS,
  AI_DEFAULT_ENDPOINT,
  AI_DEFAULT_MODEL,
} from '../src/lib/apiGuard';

const PC_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Preserve the actual login session issued in Netease's Set-Cookie headers. */
function getResponseCookie(headers: Headers): string {
  const setCookieHeaders = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
    ?? (headers.get('set-cookie') ? [headers.get('set-cookie') as string] : []);
  return setCookieHeaders
    .map((value) => value.split(';', 1)[0]?.trim())
    .filter((value): value is string => Boolean(value))
    .join('; ');
}

/** Query params from req.url (works for both full path and stripped path). */
function parseQuery(req: IncomingMessage): URLSearchParams {
  return new URL(req.url ?? '', 'http://localhost').searchParams;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function isHttpUrl(target: string | null): target is string {
  return Boolean(target && /^https?:\/\//.test(target));
}

/**
 * Same-origin fence + per-IP rate limit for every handler. The browser app
 * always sends Origin (fetch) or Referer (img/media tags), so this only
 * blocks non-browser free-riding: scripts hitting /api/ai to burn the
 * server-owned key, or using the proxies as an open relay. Extra origins can
 * be whitelisted via the AURORA_ALLOWED_ORIGINS env var (comma separated).
 */
function guardRequest(
  req: IncomingMessage,
  res: ServerResponse,
  scope: keyof typeof RATE_LIMITS,
): boolean {
  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const allowed = isAllowedRequest({
    host: String(req.headers.host ?? ''),
    origin: typeof originHeader === 'string' ? originHeader : null,
    referer: typeof refererHeader === 'string' ? refererHeader : null,
    extraAllowed: (process.env.AURORA_ALLOWED_ORIGINS ?? '').split(','),
  });
  if (!allowed) {
    res.statusCode = 403;
    res.end(JSON.stringify({ error: 'origin not allowed' }));
    return false;
  }
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';
  if (!rateLimit(scope + ':' + ip, RATE_LIMITS[scope], 60_000)) {
    res.statusCode = 429;
    res.setHeader('Retry-After', '60');
    res.end(JSON.stringify({ error: 'rate limited' }));
    return false;
  }
  return true;
}

async function streamUpstreamBody(
  res: ServerResponse,
  body: ReadableStream<Uint8Array>,
): Promise<void> {
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}

function badUrl(res: ServerResponse): void {
  res.statusCode = 400;
  res.end('bad url');
}

function upstreamFailure(res: ServerResponse, e: unknown, raw = false): void {
  res.statusCode = 502;
  res.end(raw ? String(e) : JSON.stringify({ error: String(e) }));
}

/** Generic forwarder with a caller-supplied Referer (QQ Music endpoints).
 * The packaged Tauri app uses plugin-http instead, so this never ships there. */
export async function handleProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!guardRequest(req, res, 'proxy')) return;
  const query = parseQuery(req);
  const target = query.get('url');
  const referer = query.get('referer') ?? '';
  if (!isHttpUrl(target)) {
    badUrl(res);
    return;
  }
  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': PC_USER_AGENT,
        ...(referer ? { Referer: referer } : {}),
      },
    });
    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(text);
  } catch (e) {
    upstreamFailure(res, e);
  }
}

/** Remote-image proxy - bypasses CDN hotlink / referrer blocks (covers). */
export async function handleImg(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!guardRequest(req, res, 'img')) return;
  const target = parseQuery(req).get('url');
  if (!isHttpUrl(target)) {
    badUrl(res);
    return;
  }
  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': PC_USER_AGENT,
        Referer: new URL(target).origin + '/',
      },
    });
    if (!upstream.ok || !upstream.body) {
      res.statusCode = upstream.status || 502;
      res.end('upstream error');
      return;
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    await streamUpstreamBody(res, upstream.body);
  } catch (e) {
    upstreamFailure(res, e, true);
  }
}

/** Streams remote media through the server so downloads bypass CORS. */
export async function handleMediaProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!guardRequest(req, res, 'media-proxy')) return;
  const target = parseQuery(req).get('url');
  if (!isHttpUrl(target)) {
    badUrl(res);
    return;
  }
  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': PC_USER_AGENT,
        Referer: new URL(target).origin + '/',
      },
    });
    if (!upstream.ok || !upstream.body) {
      res.statusCode = upstream.status || 502;
      res.end('upstream error');
      return;
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    res.setHeader('Cache-Control', 'no-store');
    await streamUpstreamBody(res, upstream.body);
  } catch (e) {
    upstreamFailure(res, e, true);
  }
}

/** Forwarder for Netease weapi: encryption already happened in
 * src/music/netease/weapi.ts, we only relay the form and return the upstream
 * body plus any Set-Cookie session values. */
export async function handleNeteaseWeapi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!guardRequest(req, res, 'weapi')) return;
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }
  try {
    const raw = await readBody(req);
    const { path: apiPath, form, cookie } = JSON.parse(raw) as {
      path: string;
      form: string;
      cookie?: string;
    };
    if (!apiPath || !apiPath.startsWith('/weapi/') || typeof form !== 'string') {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'bad path or form' }));
      return;
    }
    const relay = () =>
      fetch('https://music.163.com' + apiPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': PC_USER_AGENT,
          Referer: 'https://music.163.com',
          Origin: 'https://music.163.com',
          Cookie: typeof cookie === 'string' ? cookie.replace(/[\r\n]/g, '').slice(0, 12000) : '',
        },
        body: form,
      });
    // Netease risk control (-462 etc.) is per-egress-IP and intermittent;
    // repeated attempts often ride a different egress and clear it.
    let upstream = await relay();
    let text = await upstream.text();
    for (const delay of [250, 700, 1500]) {
      if (!isRiskBody(text)) break;
      await new Promise((r) => setTimeout(r, delay));
      upstream = await relay();
      text = await upstream.text();
    }
    const joined = getResponseCookie(upstream.headers);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ body: text, cookies: joined ? joined.split('; ') : [] }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: String(e) }));
  }
}

function isRiskBody(text: string): boolean {
  try {
    const code = (JSON.parse(text) as { code?: number }).code;
    return code === -462 || code === 462 || code === -460 || code === 460 || code === 512;
  } catch {
    return false;
  }
}

/** OpenAI-compatible AI pass-through. Credentials come from runtime
 * environment variables and are never accepted from browser requests. */
export async function handleAi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!guardRequest(req, res, 'ai')) return;
  const endpoint = (process.env.AURORA_AI_ENDPOINT || AI_DEFAULT_ENDPOINT).replace(/\/$/, '');
  const apiKey = process.env.AURORA_AI_API_KEY?.trim() ?? '';
  const configuredModel = process.env.AURORA_AI_MODEL?.trim() || AI_DEFAULT_MODEL;
  const allowedPaths = new Set(['/models', '/chat/completions']);

  // Vercel catch-all: req.url is the full path (e.g. "/api/ai/chat/completions").
  const rawPath = (req.url ?? '').split('?')[0];
  const stripped = rawPath.startsWith('/api/ai')
    ? rawPath.slice('/api/ai'.length)
    : rawPath;
  const subPath = stripped || '/chat/completions';

  if (subPath === '/status') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ configured: Boolean(apiKey), endpoint, model: configuredModel }));
    return;
  }
  if (!allowedPaths.has(subPath)) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'unsupported AI path' }));
    return;
  }
  if (!apiKey) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: 'AI server key is not configured' }));
    return;
  }
  const target = endpoint + subPath;
  try {
    const body = req.method === 'GET' ? '' : await readBody(req);
    const upstream = await fetch(target, {
      method: req.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': PC_USER_AGENT,
        Authorization: 'Bearer ' + apiKey,
      },
      body: req.method === 'GET' ? undefined : body,
    });
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (!upstream.body) {
      res.end(await upstream.text());
      return;
    }
    // Byte-by-byte streaming so SSE chunks reach the browser as they arrive.
    await streamUpstreamBody(res, upstream.body);
  } catch (e) {
    upstreamFailure(res, e);
  }
}
