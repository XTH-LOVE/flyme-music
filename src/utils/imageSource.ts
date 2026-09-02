import { httpFetch, isTauri } from '@/lib/apiTransport';
import { forceHttps } from '@/music/source/types';

/** Browser-like UA: some CDNs reject the plugin-http default UA. */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Normalize scheme-less (//host) and http CDN urls before any request. */
function normalize(url: string): string {
  return forceHttps(url);
}

/**
 * Artwork bytes. CDNs block hotlinks and taint cross-origin canvases, so
 * palette extraction and lyric cards both need the bytes, not just a URL.
 *
 * Browser path: a same-page CORS fetch is tried first - the Netease art CDN
 * is CORS-enabled and domestically fast, so those bytes skip the overseas
 * proxy round-trip entirely. Hotlink-protected sources (QQ/Joox) fall back
 * to /api/img exactly as before. Results are memoized per URL (promise
 * cache dedupes concurrent calls).
 */
const blobPending = new Map<string, Promise<Blob | null>>();
const BLOB_PENDING_MAX = 200;

export async function fetchImageBlob(url: string): Promise<Blob | null> {
  const normalized = normalize(url);
  if (!normalized) return null;
  const hit = blobPending.get(normalized);
  if (hit) return hit;
  const pending = loadBlob(normalized);
  if (blobPending.size >= BLOB_PENDING_MAX) {
    const oldest = blobPending.keys().next().value as string | undefined;
    if (oldest) blobPending.delete(oldest);
  }
  blobPending.set(normalized, pending);
  return pending;
}

async function loadBlob(url: string): Promise<Blob | null> {
  try {
    const res = isTauri()
      ? await httpFetch(url, {
          headers: { Referer: new URL(url).origin + '/', 'User-Agent': BROWSER_UA },
        })
      : await browserImageResponse(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** Direct CORS fetch first (fast domestic CDNs), /api/img proxy second. */
async function browserImageResponse(url: string): Promise<Response> {
  try {
    const direct = await fetch(url, { mode: 'cors' });
    if (direct.ok) return direct;
  } catch {
    /* CORS-denied or network failure -> proxy below */
  }
  return fetch('/api/img?url=' + encodeURIComponent(url));
}

const objectUrlCache = new Map<string, string>();
const OBJECT_URL_CACHE_MAX = 200;

/** <img src> for the proxy stage: blob URL in Tauri, dev proxy in browser. */
export async function proxiedImageSrc(url: string): Promise<string | null> {
  const normalized = normalize(url);
  if (!normalized) return null;
  if (!isTauri()) return '/api/img?url=' + encodeURIComponent(normalized);
  const hit = objectUrlCache.get(normalized);
  if (hit) return hit;
  const blob = await fetchImageBlob(normalized);
  if (!blob) return null;
  const objectUrl = URL.createObjectURL(blob);
  if (objectUrlCache.size >= OBJECT_URL_CACHE_MAX) {
    const oldest = objectUrlCache.keys().next().value as string | undefined;
    if (oldest) {
      const stale = objectUrlCache.get(oldest);
      objectUrlCache.delete(oldest);
      if (stale) URL.revokeObjectURL(stale);
    }
  }
  objectUrlCache.set(normalized, objectUrl);
  return objectUrl;
}