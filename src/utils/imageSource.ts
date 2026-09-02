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
 */
export async function fetchImageBlob(url: string): Promise<Blob | null> {
  const normalized = normalize(url);
  if (!normalized) return null;
  try {
    const res = isTauri()
      ? await httpFetch(normalized, {
          headers: { Referer: new URL(normalized).origin + '/', 'User-Agent': BROWSER_UA },
        })
      : await fetch('/api/img?url=' + encodeURIComponent(normalized));
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

const blobCache = new Map<string, string>();
const BLOB_CACHE_MAX = 200;

/** <img src> for the proxy stage: blob URL in Tauri, dev proxy in browser. */
export async function proxiedImageSrc(url: string): Promise<string | null> {
  const normalized = normalize(url);
  if (!normalized) return null;
  if (!isTauri()) return '/api/img?url=' + encodeURIComponent(normalized);
  const hit = blobCache.get(normalized);
  if (hit) return hit;
  const blob = await fetchImageBlob(normalized);
  if (!blob) return null;
  const objectUrl = URL.createObjectURL(blob);
  if (blobCache.size >= BLOB_CACHE_MAX) {
    const oldest = blobCache.keys().next().value as string | undefined;
    if (oldest) {
      const stale = blobCache.get(oldest);
      blobCache.delete(oldest);
      if (stale) URL.revokeObjectURL(stale);
    }
  }
  blobCache.set(normalized, objectUrl);
  return objectUrl;
}