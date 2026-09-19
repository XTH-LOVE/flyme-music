/**
 * Shared helpers for the Cloudflare Pages Functions under functions/api.
 * This file exports no onRequest handler, so Cloudflare does NOT expose it
 * as a route.
 *
 * Logic mirrors server/auroraApi.ts (the Vercel/Node variant); here we target
 * the Workers runtime (fetch-style Request/Response). On Cloudflare the
 * routing prefix is stripped before the handler runs, so request.url's
 * pathname already equals the route path.
 */

import {
  isAllowedRequest,
  rateLimit,
  RATE_LIMITS,
  type GuardInput,
} from '../../src/lib/apiGuard';

export {
  isAllowedRequest,
  rateLimit,
  RATE_LIMITS,
  AI_DEFAULT_ENDPOINT,
  AI_DEFAULT_MODEL,
} from '../../src/lib/apiGuard';

export const PC_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export type Env = Record<string, string | undefined>;

export interface PagesContext {
  env: Env;
  request: Request;
  params: Record<string, string | string[]>;
}

/**
 * Same-origin fence + per-IP rate limit shared by every function. Returns the
 * blocking Response, or null when the request may proceed. The browser app
 * always sends Origin/Referer, so this only fences off non-browser free-riding
 * (scripts burning the AI key, open-proxy abuse). Extra origins can be
 * whitelisted via the AURORA_ALLOWED_ORIGINS env var (comma separated hosts).
 */
export function guard(request: Request, env: Env, scope: keyof typeof RATE_LIMITS): Response | null {
  const input: GuardInput = {
    host: new URL(request.url).host,
    origin: request.headers.get('origin'),
    referer: request.headers.get('referer'),
    extraAllowed: (env.AURORA_ALLOWED_ORIGINS ?? '').split(','),
  };
  if (!isAllowedRequest(input)) {
    return json({ error: 'origin not allowed' }, 403);
  }
  const ip =
    request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]
    ?? 'unknown';
  if (!rateLimit(scope + ':' + ip, RATE_LIMITS[scope], 60_000)) {
    return json({ error: 'rate limited' }, 429);
  }
  return null;
}

// Re-exported from the shared guard so both backends have exactly one
// definition - a second copy is how the two runtimes drifted before.
export { isHttpUrl, isAllowedProxyTarget, sanitizeProxyContentType } from '../../src/lib/apiGuard';

export function queryParam(request: Request, name: string): string | null {
  return new URL(request.url).searchParams.get(name);
}

/** Preserve the actual login session issued in Netease's Set-Cookie headers. */
export function getResponseCookies(headers: Headers): string[] {
  const list =
    typeof (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];
  return list
    .map((value) => value.split(';', 1)[0]?.trim())
    .filter((value): value is string => Boolean(value));
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorJson(e: unknown, status = 502): Response {
  return json({ error: String(e) }, status);
}
