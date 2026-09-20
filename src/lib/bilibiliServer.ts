/**
 * Server-side Bilibili access, shared by both backends.
 *
 * Two reasons this cannot happen in the browser:
 *
 *   1. Bilibili's search API answers 412 to any request without a `buvid3`
 *      cookie, and that cookie is only issued by the site itself. Fetching the
 *      homepage from the browser is a cross-origin request, so the cookie can
 *      never be read there.
 *   2. The API sends no CORS headers at all.
 *
 * So the cookie is bootstrapped and cached here, per isolate, and the endpoint
 * forwards a small fixed set of API paths. The whitelist matters: without it
 * this would be an open relay to bilibili.com, and the whole point of the guard
 * on the other endpoints is to not be one.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BILIBILI_HOME = 'https://www.bilibili.com/';
const BILIBILI_API = 'https://api.bilibili.com';

/** Only these API paths may be reached through the endpoint. */
export const ALLOWED_PATHS = new Set([
  '/x/web-interface/search/type',
  '/x/web-interface/view',
  '/x/player/playurl',
  '/x/player/v2',
]);

/** The cookie that satisfies bilibili's risk control. */
const REQUIRED_COOKIE = 'buvid3';
const COOKIE_TTL_MS = 6 * 60 * 60 * 1000;

interface CookieCache {
  value: string;
  expiresAt: number;
}

let cookieCache: CookieCache | null = null;

/** Extract Set-Cookie values across runtimes (Node vs Workers differ). */
function readSetCookie(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === 'function') return withGetSetCookie.getSetCookie();
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

/**
 * Obtain a `buvid3` cookie, reusing the cached one while it lasts.
 *
 * Returns null when bilibili declines to issue one, in which case callers should
 * report a source-unavailable error rather than retrying blindly - the endpoint
 * is a scrape-adjacent dependency and can go quiet.
 */
export async function bilibiliCookie(now = Date.now()): Promise<string | null> {
  if (cookieCache && cookieCache.expiresAt > now) return cookieCache.value;
  try {
    const response = await fetch(BILIBILI_HOME, { headers: { 'User-Agent': UA } });
    const cookies = readSetCookie(response.headers)
      .map((entry) => entry.split(';', 1)[0]?.trim())
      .filter((entry): entry is string => Boolean(entry));
    if (!cookies.length) return null;
    const value = cookies.join('; ');
    if (!value.includes(REQUIRED_COOKIE)) return null;
    cookieCache = { value, expiresAt: now + COOKIE_TTL_MS };
    return value;
  } catch {
    return null;
  }
}

export type BilibiliFailure = 'blocked' | 'upstream_error' | 'path_not_allowed';

export interface BilibiliUpstream {
  status: number;
  body: string;
}

/**
 * A device identifier bilibili accepts without registration.
 *
 * The site issues one via `buvid3` on the homepage, but that bootstrap fails
 * from datacenter IPs (Cloudflare's included) - measured directly. The API also
 * answers fine with no cookie at all in many cases, so this is only a retry
 * lever, not a precondition.
 */
function generatedBuvid3(): string {
  const hex = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  const group = (n: number) => Array.from({ length: n }, hex).join('');
  return `buvid3=${group(2)}-${group(2)}-${group(2)}-${group(2)}-${group(6)}infoc`;
}

function looksBlocked(status: number, body: string): boolean {
  if (status === 412 || status === 403) return true;
  // Risk control answers with an HTML page rather than JSON.
  return body.trimStart().startsWith('<');
}

async function callOnce(
  path: string,
  params: URLSearchParams,
  cookie: string | null,
  signal?: AbortSignal,
): Promise<BilibiliUpstream | null> {
  try {
    const response = await fetch(`${BILIBILI_API}${path}?${params.toString()}`, {
      headers: {
        'User-Agent': UA,
        Referer: BILIBILI_HOME,
        Origin: 'https://www.bilibili.com',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      signal,
    });
    return { status: response.status, body: await response.text() };
  } catch {
    return null;
  }
}

/**
 * Call one whitelisted Bilibili API path.
 *
 * Tries with whatever cookie we have - including none, because the API often
 * answers fine without one and the homepage bootstrap does not work from a
 * datacenter IP. Only if that comes back blocked is a generated device id tried,
 * which is the retry lever rather than a precondition. The original design
 * treated the cookie as required and gave up before even asking, which made the
 * whole source unusable on Cloudflare.
 *
 * On failure the reason is returned rather than thrown, because the cases need
 * different responses: `blocked` means bilibili is refusing this caller,
 * `upstream_error` means it is briefly unreachable, and `path_not_allowed` is a
 * caller bug.
 */
export async function bilibiliUpstream(
  path: string,
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<BilibiliUpstream | { failure: BilibiliFailure }> {
  if (!ALLOWED_PATHS.has(path)) return { failure: 'path_not_allowed' };

  const cached = await bilibiliCookie();
  const first = await callOnce(path, params, cached, signal);
  if (!first) return { failure: 'upstream_error' };
  if (!looksBlocked(first.status, first.body)) return first;

  // Blocked: retry once with a device id before giving up.
  const retry = await callOnce(path, params, cached ?? generatedBuvid3(), signal);
  if (!retry) return { failure: 'upstream_error' };
  if (!looksBlocked(retry.status, retry.body)) return retry;
  return { failure: 'blocked' };
}

export function isUpstreamFailure(
  result: BilibiliUpstream | { failure: BilibiliFailure },
): result is { failure: BilibiliFailure } {
  return 'failure' in result;
}

/** Reset the cached cookie. Only used by tests. */
export function __resetBilibiliCookie(): void {
  cookieCache = null;
}
