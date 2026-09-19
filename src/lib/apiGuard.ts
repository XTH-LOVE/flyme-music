/**
 * Protection shared by every deployed /api endpoint, on both serverless
 * runtimes:
 *   - server/auroraApi.ts   (Node/Vercel) - passes header strings in
 *   - functions/api/_shared.ts (Workers/Cloudflare) - passes a Request
 *
 * Threat model: without a guard, anyone on the internet can (a) burn the
 * server-owned AI key through /api/ai, (b) use /api/proxy, /api/img and
 * /api/media-proxy as a free open-proxy/CORS-bypass network, and (c) get the
 * deployment domain flagged by the host. Same-origin evidence (Origin or
 * Referer) is the cheapest reliable filter: the web app always sends one,
 * while scripts/curl normally send neither.
 */

/** Fallback AI pass-through defaults shared by both runtimes so the two
 * deployments behave identically (override with AURORA_AI_ENDPOINT/_MODEL). */
export const AI_DEFAULT_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4';
export const AI_DEFAULT_MODEL = 'glm-4-flash';

export interface GuardInput {
  /** Host the request was served on, e.g. "aurora.example.com" (no scheme). */
  host: string;
  /** Raw Origin header, when present. */
  origin: string | null;
  /** Raw Referer header, when present. */
  referer: string | null;
  /** Extra allowed hosts from AURORA_ALLOWED_ORIGINS (host or scheme://host). */
  extraAllowed: string[];
}

/** Host of an absolute URL, lowercased; null when unparseable ("null" Origin). */
export function hostOf(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * The packaged app's webview origin, which is always trusted: it is a
 * first-party client that legitimately calls the deployed /api endpoints.
 * Windows reports `http://tauri.localhost`, macOS/Linux/Android report
 * `tauri://localhost`. These are matched on the RAW header value, because
 * `tauri://localhost` parses down to the bare host "localhost" and would
 * otherwise be indistinguishable from a forged loopback origin.
 */
const TAURI_ORIGINS = [
  /^tauri:\/\/localhost(?::\d+)?\/?$/i,
  /^https?:\/\/tauri\.localhost(?::\d+)?\/?$/i,
];

/** Loopback hosts, with or without a port. */
function isLoopback(host: string): boolean {
  const bare = host.replace(/:\d+$/, '').toLowerCase();
  return bare === 'localhost' || bare === '127.0.0.1' || bare === '[::1]' || bare === '::1';
}

/**
 * Decide whether a request carries acceptable origin evidence. Requests with
 * neither Origin nor Referer are rejected - the browser app always sends one
 * of the two (default referrer policy), so only non-browser scripts hit that
 * path.
 *
 * NOTE ON RESIDUAL RISK: Origin/Referer are attacker-controlled outside a
 * browser, so this fence is a cheap filter against drive-by scripts and
 * scanners, NOT an authentication boundary. Loopback origins are therefore
 * only honoured when the request was *served* from loopback as well; trusting
 * them on a public deployment would let anyone in with a forged
 * `Origin: http://localhost`. Anything that must be genuinely protected
 * (i.e. /api/ai, which spends a server-owned key) needs real auth plus
 * platform-level rate limiting.
 */
export function isAllowedRequest({ host, origin, referer, extraAllowed }: GuardInput): boolean {
  const serving = host.trim().toLowerCase();
  if (!serving) return false;
  const evidence = origin?.trim() || referer?.trim() || '';
  if (!evidence) return false;
  if (TAURI_ORIGINS.some((re) => re.test(evidence))) return true;
  const candidate = hostOf(evidence);
  if (!candidate) return false;
  if (candidate === serving) return true;
  if (isLoopback(candidate) && isLoopback(serving)) return true;
  return extraAllowed.some((entry) => hostOf(entry.trim()) === candidate || entry.trim().toLowerCase() === candidate);
}

/* ---------------- Proxy target and response hardening ---------------- */

/** Scheme check only. Never sufficient on its own - see isAllowedProxyTarget. */
export function isHttpUrl(target: string | null): target is string {
  return Boolean(target && /^https?:\/\//i.test(target));
}

/** Hostnames that always resolve inside the deployment's own network. */
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

function isPrivateAddress(host: string): boolean {
  // Bracketed IPv6 literal -> bare form.
  const bare = host.replace(/^\[|\]$/g, '').toLowerCase();

  if (bare === 'localhost' || bare === '::1' || bare === '::') return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => bare.endsWith(suffix))) return true;

  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{0,2}:/.test(bare) || /^fe[89ab][0-9a-f]?:/.test(bare)) return true;

  if (/^\d+$/.test(bare)) return true; // bare integer = alternative IPv4 encoding

  const v4 = bare.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a >= 224) return true; // multicast / reserved
  }
  return false;
}

/**
 * Whether a URL is safe to fetch on the caller's behalf.
 *
 * `isHttpUrl` alone only checked the scheme, which made /api/proxy, /api/img and
 * /api/media-proxy open relays: any host, any port. On Cloudflare the platform
 * incidentally blocks loopback and metadata addresses, but the same code also
 * runs on plain Node (server/auroraApi.ts) where nothing does - so the check has
 * to live here rather than relying on the platform.
 */
export function isAllowedProxyTarget(target: string | null): target is string {
  if (!isHttpUrl(target)) return false;
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  if (url.username || url.password) return false; // credentials in the URL
  if (url.port && url.port !== '80' && url.port !== '443') return false;
  return !isPrivateAddress(url.hostname);
}

/**
 * Content types a proxy is allowed to hand back.
 *
 * The proxies echoed the upstream `Content-Type` verbatim, so a proxied
 * third-party document came back as `text/html` **from our own origin** - one
 * navigation away from running as same-origin script. Clients here only ever use
 * `.text()` / `.json()`, so HTML-ish types are downgraded to text/plain: the data
 * still arrives, the browser no longer treats it as a document.
 */
export function sanitizeProxyContentType(
  upstream: string | null | undefined,
  kind: 'image' | 'media' | 'text',
): string {
  const type = (upstream ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

  if (kind === 'image') {
    // SVG can carry script and is deliberately excluded from the renderable set.
    if (type.startsWith('image/') && type !== 'image/svg+xml') return upstream as string;
    return 'application/octet-stream';
  }
  if (kind === 'media') {
    if (type.startsWith('audio/') || type.startsWith('video/')) return upstream as string;
    return 'application/octet-stream';
  }
  // text: keep JSON (clients parse it) but never a type the browser renders.
  if (type === 'application/json' || type.endsWith('+json')) return upstream as string;
  return 'text/plain; charset=utf-8';
}

/* ---------------- Best-effort rate limiting ---------------- */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Fixed-window limiter kept in isolate memory. Isolates are ephemeral, so
 * this blunts bursts rather than providing hard global guarantees - pair it
 * with platform rate-limiting rules (Cloudflare/Vercel) for those.
 */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** Per-endpoint limits (requests per IP per minute). */
export const RATE_LIMITS = {
  img: 120,
  proxy: 60,
  weapi: 60,
  'media-proxy': 30,
  ai: 30,
} as const;
