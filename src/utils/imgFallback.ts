/**
 * Remembers which image URLs failed a direct CDN load, so remounts skip
 * straight to the proxy instead of repeating the failing attempt on
 * every page switch (persisted across reloads).
 */
const FAILED_KEY = 'aurora.img.direct_failed.v1';

/** CDNs recover (cooldowns, region rerouting), so failures expire in a week. */
const ENTRY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

type StoredEntry = [string, number];

const directFailed: Map<string, number> = (() => {
  const map = new Map<string, number>();
  try {
    // Old format was a plain string[]; accept it and stamp entries as fresh.
    const raw = JSON.parse(localStorage.getItem(FAILED_KEY) ?? '[]') as (string | StoredEntry)[];
    const now = Date.now();
    for (const entry of raw) {
      const pair: StoredEntry =
        Array.isArray(entry) && typeof entry[1] === 'number' ? entry : [entry as string, now];
      if (typeof pair[0] === 'string' && now - pair[1] < ENTRY_TTL_MS) {
        map.set(pair[0], pair[1]);
      }
    }
  } catch {
    /* corrupted store - start clean */
  }
  return map;
})();

function persist(): void {
  try {
    localStorage.setItem(FAILED_KEY, JSON.stringify([...directFailed]));
  } catch {
    /* ignore quota errors */
  }
}

export type ImgStage = 'direct' | 'proxy';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function isMarked(key: string): boolean {
  const markedAt = directFailed.get(key);
  if (markedAt === undefined) return false;
  if (Date.now() - markedAt >= ENTRY_TTL_MS) {
    directFailed.delete(key);
    persist();
    return false;
  }
  return true;
}

/**
 * A CDN almost never fails for one artwork only: if p2.music.126.net is
 * unreachable it is unreachable for every song on it. Tracking by exact URL
 * meant each new cover paid the failing attempt again, so a page of results
 * would hang one image at a time. The host is recorded alongside the URL so the
 * rest of the page skips straight to the proxy.
 */
export function initialImgStage(url: string | null | undefined): ImgStage {
  if (!url) return 'direct';
  const host = hostOf(url);
  if (isMarked(url) || (host && isMarked(host))) return 'proxy';
  return 'direct';
}

/**
 * Record that a direct CDN load failed.
 *
 * `host` decides how far the lesson generalises, and the two callers have
 * genuinely different evidence:
 *
 *   - an `error` event means the CDN refused, which applies to everything on it,
 *     so the host is marked and the rest of the page skips the failing attempt;
 *   - a timeout only means this one image was slow, which on a poor connection
 *     says nothing about the host. Marking the host there turned one slow image
 *     into every cover on the page breaking.
 */
export function markDirectFailed(
  url: string | null | undefined,
  options: { host: boolean } = { host: true },
): void {
  if (!url) return;
  const keys = options.host ? [url, hostOf(url)] : [url];
  let changed = false;
  for (const key of keys) {
    if (!key || directFailed.has(key)) continue;
    directFailed.set(key, Date.now());
    changed = true;
  }
  if (!changed) return;
  if (directFailed.size > MAX_ENTRIES) {
    // Evict the oldest marks first.
    const oldest = [...directFailed.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, directFailed.size - MAX_ENTRIES);
    for (const [key] of oldest) directFailed.delete(key);
  }
  persist();
}

/** Netease CDN serves resized art via ?param=WxH; keep mobile transfers small. */
export function withPicSize(url: string | null | undefined, size: string): string {
  if (!url) return '';
  if (!url.includes('music.126.net') || url.includes('?param=')) return url;
  return url + '?param=' + size;
}
