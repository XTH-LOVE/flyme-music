import { useEffect, useState } from 'react';
import { withPicSize } from './imgFallback';

export type CoverPalette = [string, string];

const cache = new Map<string, Promise<CoverPalette | null>>();

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

function lighten(hex: string, amount = 0.45): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * amount);
  return toHex(mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255));
}

/** Dominant-color extraction: weighted hue buckets + a lighter companion. */
async function extract(picUrl: string): Promise<CoverPalette | null> {
  try {
    const src = withPicSize(picUrl, '300y300') || picUrl;
    // Same-origin proxy keeps the canvas readable: CDNs block cross-origin
    // pixel reads, and hotlinking fails outright without a Referer.
    const res = await fetch('/api/img?url=' + encodeURIComponent(src));
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const N = 24;
    const canvas = document.createElement('canvas');
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, N, N);
    bmp.close?.();
    const d = ctx.getImageData(0, 0, N, N).data;
    const BINS = 12;
    const wsum = new Array<number>(BINS).fill(0);
    const rsum = new Array<number>(BINS).fill(0);
    const gsum = new Array<number>(BINS).fill(0);
    const bsum = new Array<number>(BINS).fill(0);
    let ar = 0, ag = 0, ab = 0, any = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      ar += r; ag += g; ab += b; any++;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      const lum = (r * 2 + g * 3 + b) / 6;
      if (lum < 16 || lum > 248) continue;
      const w = sat * sat * (1 - Math.abs(lum - 128) / 170);
      if (w <= 0.02) continue;
      let h = 0;
      const df = mx - mn;
      if (df > 0) {
        if (mx === r) h = ((g - b) / df) % 6;
        else if (mx === g) h = (b - r) / df + 2;
        else h = (r - g) / df + 4;
        h = (h * 60 + 360) % 360;
      }
      const bi = Math.floor(h / 30) % BINS;
      wsum[bi] += w; rsum[bi] += r * w; gsum[bi] += g * w; bsum[bi] += b * w;
    }
    if (!any) return null;
    let best = -1, second = -1;
    for (let i = 0; i < BINS; i++) {
      if (best < 0 || wsum[i] > wsum[best]) { second = best; best = i; }
      else if (second < 0 || wsum[i] > wsum[second]) second = i;
    }
    if (best >= 0 && wsum[best] > 0) {
      const a = toHex(rsum[best] / wsum[best], gsum[best] / wsum[best], bsum[best] / wsum[best]);
      const b =
        second >= 0 && wsum[second] > wsum[best] * 0.3
          ? toHex(rsum[second] / wsum[second], gsum[second] / wsum[second], bsum[second] / wsum[second])
          : lighten(a);
      return [a, b];
    }
    // Fully desaturated artwork: use the raw average instead.
    const avg = toHex(ar / any, ag / any, ab / any);
    return [avg, lighten(avg, 0.3)];
  } catch {
    return null;
  }
}

/** Dominant colors of a track's artwork (cached per URL), null while unknown. */
export function coverPaletteOf(picUrl: string | null | undefined): Promise<CoverPalette | null> {
  if (!picUrl) return Promise.resolve(null);
  let hit = cache.get(picUrl);
  if (!hit) {
    hit = extract(picUrl);
    cache.set(picUrl, hit);
  }
  return hit;
}

/** React hook: reactive palette for the given artwork, null until resolved. */
export function useCoverPalette(
  picUrl: string | null | undefined,
  seedId: string,
): CoverPalette | null {
  const [palette, setPalette] = useState<CoverPalette | null>(null);
  useEffect(() => {
    let alive = true;
    setPalette(null);
    void coverPaletteOf(picUrl).then((p) => {
      if (alive && p) setPalette(p);
    });
    return () => {
      alive = false;
    };
  }, [picUrl, seedId]);
  return palette;
}
