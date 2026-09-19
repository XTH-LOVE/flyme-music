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

export interface BilibiliUpstream {
  status: number;
  body: string;
}

/**
 * Call one whitelisted Bilibili API path.
 *
 * `signal` is accepted so a slow upstream can be abandoned rather than holding
 * the request open; callers bound it with their own timeout.
 */
export async function bilibiliUpstream(
  path: string,
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<BilibiliUpstream | null> {
  if (!ALLOWED_PATHS.has(path)) return null;
  const cookie = await bilibiliCookie();
  if (!cookie) return null;
  try {
    const response = await fetch(`${BILIBILI_API}${path}?${params.toString()}`, {
      headers: {
        'User-Agent': UA,
        Referer: BILIBILI_HOME,
        Cookie: cookie,
        Origin: 'https://www.bilibili.com',
      },
      signal,
    });
    return { status: response.status, body: await response.text() };
  } catch {
    return null;
  }
}

/** Reset the cached cookie. Only used by tests. */
export function __resetBilibiliCookie(): void {
  cookieCache = null;
}
