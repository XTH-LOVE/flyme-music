/**
 * Remembers which image URLs failed a direct CDN load, so remounts skip
 * straight to the proxy instead of repeating the failing attempt on
 * every page switch (persisted across reloads).
 */
const FAILED_KEY = 'aurora.img.direct_failed.v1';

const directFailed: Set<string> = (() => {
  try {
    const stored = JSON.parse(localStorage.getItem(FAILED_KEY) ?? '[]') as string[];
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set<string>();
  }
})();

export type ImgStage = 'direct' | 'proxy';

export function initialImgStage(url: string | null | undefined): ImgStage {
  return url && directFailed.has(url) ? 'proxy' : 'direct';
}

export function markDirectFailed(url: string | null | undefined): void {
  if (!url || directFailed.has(url)) return;
  directFailed.add(url);
  try {
    localStorage.setItem(FAILED_KEY, JSON.stringify([...directFailed].slice(-300)));
  } catch {
    /* ignore quota errors */
  }
}

/** Netease CDN serves resized art via ?param=WxH; keep mobile transfers small. */
export function withPicSize(url: string | null | undefined, size: string): string {
  if (!url) return '';
  if (!url.includes('music.126.net') || url.includes('?param=')) return url;
  return url + '?param=' + size;
}
