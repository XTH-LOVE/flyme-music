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

/** Hosts that always belong to "us": the Tauri webviews and vite dev. */
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  'localhost:5173',
  '127.0.0.1:5173',
  'tauri.localhost',
]);

/**
 * Decide whether a request carries acceptable origin evidence. Requests with
 * neither Origin nor Referer are rejected - the browser app always sends one
 * of the two (default referrer policy), so only non-browser scripts hit that
 * path.
 */
export function isAllowedRequest({ host, origin, referer, extraAllowed }: GuardInput): boolean {
  const serving = host.trim().toLowerCase();
  if (!serving) return false;
  const candidate = origin?.trim()
    ? hostOf(origin)
    : referer?.trim()
      ? hostOf(referer)
      : null;
  if (!candidate) return false;
  if (candidate === serving) return true;
  if (LOCAL_HOSTS.has(candidate)) return true;
  return extraAllowed.some((entry) => hostOf(entry.trim()) === candidate || entry.trim().toLowerCase() === candidate);
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
