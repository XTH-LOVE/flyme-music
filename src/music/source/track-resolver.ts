import type { MusicTrack } from './types';
import { getTrackProvider } from './factory';
import { getStreamUrl } from '@/library/offlineCache';
import { getLocalStreamUrl } from '@/library/localLibrary';

/**
 * Cached resolution of remote media (stream url / cover).
 * Remote URLs expire (e.g. Joox vkey), so caches carry a TTL.
 */
const URL_TTL_MS = 15 * 60 * 1000;
const PIC_TTL_MS = 24 * 60 * 60 * 1000;
const PIC_PERSIST_TTL = 7 * 24 * 60 * 60 * 1000;
const PIC_STORE_KEY = 'aurora.pic.cache.v1';

interface CacheEntry<T> {
  value: T | null;
  expiresAt: number;
}

const urlCache = new Map<string, CacheEntry<string>>();
const urlInflight = new Map<string, Promise<string | null>>();
const picCache = new Map<string, CacheEntry<string>>();
const picInflight = new Map<string, Promise<string | null>>();

// Restore persisted cover URLs so page reloads skip re-resolution entirely.
try {
  const stored = JSON.parse(localStorage.getItem(PIC_STORE_KEY) ?? '{}') as Record<string, { value: string; expiresAt: number }>;
  const now = Date.now();
  for (const [k, e] of Object.entries(stored)) {
    if (e && e.value && e.expiresAt > now) {
      picCache.set(k, { value: e.value, expiresAt: Math.min(e.expiresAt, now + PIC_PERSIST_TTL) });
    }
  }
} catch {
  /* ignore corrupted cache */
}

function persistPic(key: string, url: string): void {
  try {
    const stored = JSON.parse(localStorage.getItem(PIC_STORE_KEY) ?? '{}') as Record<string, { value: string; expiresAt: number }>;
    stored[key] = { value: url, expiresAt: Date.now() + PIC_PERSIST_TTL };
    const keys = Object.keys(stored);
    if (keys.length > 500) {
      keys.sort((a, b) => stored[a].expiresAt - stored[b].expiresAt);
      for (const k of keys.slice(0, keys.length - 500)) delete stored[k];
    }
    localStorage.setItem(PIC_STORE_KEY, JSON.stringify(stored));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Cover-cache occupancy, for the storage page.
 *
 * `bytes` is the length of the persisted JSON string, i.e. an approximation of
 * the localStorage footprint (UTF-16 code units), not a decoded byte count.
 * That is the number that matters for quota, which is what the page reports.
 */
export function picCacheStats(): { count: number; bytes: number } {
  let bytes = 0;
  try {
    bytes = (localStorage.getItem(PIC_STORE_KEY) ?? '').length;
  } catch {
    /* ignore */
  }
  return { count: picCache.size, bytes };
}

/** Drop every cached cover: in-memory maps plus the persisted copy. */
export function clearPicCache(): void {
  picCache.clear();
  picInflight.clear();
  try {
    localStorage.removeItem(PIC_STORE_KEY);
  } catch {
    /* ignore */
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function read<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

export async function resolveTrackUrl(track: MusicTrack, br = 320): Promise<string | null> {
  // Mock tracks are simulated only; local files stream straight from IndexedDB.
  if (track.source === 'mock') return null;
  if (track.source === 'local') return getLocalStreamUrl(track);
  const key = track.source + ':' + track.url_id + ':' + br;
  const cached = read(urlCache, key);
  if (cached !== undefined) return cached;
  // Offline cache first: an IDB hit needs no network at all and answers with
  // a same-origin blob: URL (which also keeps the Web Audio graph untainted).
  const offline = await getStreamUrl(track);
  if (offline) {
    urlCache.set(key, { value: offline, expiresAt: Date.now() + URL_TTL_MS });
    return offline;
  }
  const pending = urlInflight.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      // Fall back through qualities quickly: an empty URL usually means the
      // quality is unavailable, not a transient error - retrying the same
      // quality only adds latency to playback start.
      // Cap the ladder at 320: providers reject 999 for non-VIP tracks, so
      // the fallback is 320 -> 192 -> 128 (standard) - always ending playable.
      const qualities = Array.from(new Set([br, 320, 192, 128]));
      for (let attempt = 0; attempt < qualities.length; attempt += 1) {
        try {
          const url = await getTrackProvider(track.source).getUrl(track, qualities[attempt]);
          if (url) {
            urlCache.set(key, { value: url, expiresAt: Date.now() + URL_TTL_MS });
            return url;
          }
        } catch {
          /* try the next quality */
        }
        if (attempt < qualities.length - 1) await wait(200);
      }
      // Keep failures short-lived so the next play action can recover quickly.
      urlCache.set(key, { value: null, expiresAt: Date.now() + 2_000 });
      return null;
    } finally {
      urlInflight.delete(key);
    }
  })();
  urlInflight.set(key, promise);
  return promise;
}

export async function resolveTrackPic(track: MusicTrack, size = 500): Promise<string | null> {
  if (track.picUrl) return track.picUrl;
  if (track.source === 'mock' || track.source === 'local') return null;
  const key = track.source + ':' + track.pic_id;
  const cached = read(picCache, key);
  if (cached !== undefined) return cached;
  const pending = picInflight.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const url = await getTrackProvider(track.source).getPic(track, size);
      picCache.set(key, { value: url, expiresAt: Date.now() + (url ? PIC_TTL_MS : 60_000) });
      if (url) persistPic(key, url);
      return url;
    } catch {
      return null;
    } finally {
      picInflight.delete(key);
    }
  })();
  picInflight.set(key, promise);
  return promise;
}
