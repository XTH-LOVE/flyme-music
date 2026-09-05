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

export function initialImgStage(url: string | null | undefined): ImgStage {
  if (!url) return 'direct';
  const markedAt = directFailed.get(url);
  if (markedAt === undefined) return 'direct';
  if (Date.now() - markedAt >= ENTRY_TTL_MS) {
    directFailed.delete(url);
    persist();
    return 'direct';
  }
  return 'proxy';
}

export function markDirectFailed(url: string | null | undefined): void {
  if (!url || directFailed.has(url)) return;
  directFailed.set(url, Date.now());
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
