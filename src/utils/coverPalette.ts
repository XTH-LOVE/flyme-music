import { useEffect, useState } from 'react';
import { withPicSize } from './imgFallback';
import { fetchImageBlob } from './imageSource';
import { safePalette } from './palette';

export type CoverPalette = [string, string];

/**
 * Bounded, like the object URL cache next door.
 *
 * This held every cover the session had ever seen. Each entry is a promise plus
 * two colour strings, which is small - but a session that plays for hours
 * through radio or autoplay sees thousands of distinct covers, and nothing ever
 * removed one. The oldest is dropped once the limit is reached, which is the
 * right thing to lose: the covers being looked at are the recent ones.
 */
const cache = new Map<string, Promise<CoverPalette | null>>();
const CACHE_MAX = 200;

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

/** Keep ambient colours expressive without allowing near-black swatches to
 * become a hard vignette. Color Thief's role-based swatches do the same job:
 * the artwork supplies hue, while the surface chooses a usable tone. */
function ambientTone(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
  if (luma < 42) return lighten(hex, 0.28);
  /*
   * The extracted colour is also used as the global Monet accent. A nearly
   * white cover must not turn --am-accent into white: that makes navigation,
   * controls and focus states appear to disappear. Compress only the upper
   * tonal range and preserve the hue/chroma as much as possible.
   */
  if (luma > 202) {
    const scale = 190 / luma;
    return toHex(r * scale, g * scale, b * scale);
  }
  return hex;
}

interface ColorCluster {
  r: number;
  g: number;
  b: number;
  weight: number;
}

function colorDistance(a: ColorCluster, b: ColorCluster): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/** Dominant-color extraction: spatially weighted quantization with a tonal companion. */
async function extract(picUrl: string): Promise<CoverPalette | null> {
  try {
    const src = withPicSize(picUrl, '300y300') || picUrl;
    // Bytes (not a URL) keep the canvas readable: CDNs block cross-origin
    // pixel reads, and hotlinking fails outright without a Referer.
    const blob = await fetchImageBlob(src);
    if (!blob) return null;
    const bmp = await createImageBitmap(blob);
    const N = 32;
    const canvas = document.createElement('canvas');
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, N, N);
    bmp.close?.();
    const d = ctx.getImageData(0, 0, N, N).data;
    const clusters = new Map<string, ColorCluster>();
    let ar = 0, ag = 0, ab = 0, any = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      ar += r; ag += g; ab += b; any++;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      const lum = (r * 2 + g * 3 + b) / 6;
      if (lum < 16 || lum > 248) continue;
      const pixel = i / 4;
      const x = pixel % N;
      const y = Math.floor(pixel / N);
      const distanceFromCenter = Math.hypot(x - N / 2, y - N / 2) / (N / 2);
      const centerWeight = 1 + Math.max(0, 1 - distanceFromCenter) * 0.55;
      const w = Math.max(0.08, sat * sat * (1 - Math.abs(lum - 128) / 170)) * centerWeight;
      if (w <= 0.02) continue;
      const key = [Math.round(r / 24), Math.round(g / 24), Math.round(b / 24)].join(',');
      const cluster = clusters.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 };
      cluster.r += r * w;
      cluster.g += g * w;
      cluster.b += b * w;
      cluster.weight += w;
      clusters.set(key, cluster);
    }
    if (!any) return null;
    const ranked = [...clusters.values()]
      .map((cluster) => ({
        ...cluster,
        r: cluster.r / cluster.weight,
        g: cluster.g / cluster.weight,
        b: cluster.b / cluster.weight,
      }))
      .sort((a, b) => b.weight - a.weight);
    const best = ranked[0];
    if (best) {
      const secondary = ranked.find((candidate) => colorDistance(best, candidate) > 55 && candidate.weight > best.weight * 0.16);
      const a = ambientTone(toHex(best.r, best.g, best.b));
      const b = secondary
        ? ambientTone(toHex(secondary.r, secondary.g, secondary.b))
        : ambientTone(lighten(a, 0.38));
      return safePalette([a, b]);
    }
    // Fully desaturated artwork: use the raw average instead.
    const avg = ambientTone(toHex(ar / any, ag / any, ab / any));
    return safePalette([avg, ambientTone(lighten(avg, 0.3))]);
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
    // Evict the oldest before inserting, so the map never exceeds the limit.
    // Only for a key that is actually new: re-setting an existing one does not
    // grow the map, and evicting for it would throw away a live entry.
    if (!cache.has(picUrl) && cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
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
