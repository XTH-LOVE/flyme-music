import type { MusicSource, MusicTrack, RawApiTrack } from './types';
import { forceHttps } from './types';
import {
  fetchWithTimeout,
  getOrderedMusicApiUrls,
  markMusicApiUrlFailure,
  markMusicApiUrlSuccess,
} from './api-config';

export const normalizeTrack = (t: RawApiTrack, source: MusicSource): MusicTrack => ({
  id: String(t.id),
  name: t.name,
  artist: Array.isArray(t.artist) ? t.artist : [t.artist],
  album: t.album,
  pic_id: forceHttps(t.pic_id),
  url_id: forceHttps(t.url_id),
  lyric_id: forceHttps(t.lyric_id),
  source,
});

export const isAbort = (e: unknown): boolean =>
  (e instanceof Error ||
    (typeof DOMException !== 'undefined' && e instanceof DOMException)) &&
  (e as Error).name === 'AbortError';

const buildUrl = (
  apiBase: string,
  params: Record<string, string | number | undefined>,
) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) search.set(k, String(v));
  }
  const sep = apiBase.includes('?') ? '&' : '?';
  return apiBase + sep + search.toString();
};

async function requestJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetchWithTimeout(url, signal ? { signal } : {});
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText);
  return (await res.json()) as T;
}

/**
 * Try every configured API endpoint in order; healthy ones first.
 * Failures put an endpoint into cooldown, success clears it.
 */
export async function requestMusicApiJSON<T>(
  params: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  const apiBases = getOrderedMusicApiUrls();
  let lastError: unknown;

  for (const apiBase of apiBases) {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    const url = buildUrl(apiBase, params);
    try {
      const result = await requestJSON<T>(url, signal);
      markMusicApiUrlSuccess(apiBase);
      return result;
    } catch (e) {
      if (isAbort(e)) throw e;
      markMusicApiUrlFailure(apiBase);
      lastError = e;
    }
  }

  throw lastError ?? new Error('No available music API endpoint');
}

/** [mm:ss.xxx] tagged LRC text -> timed lines. */
export function parseLrc(lrc: string): { time: number; text: string }[] {
  if (!lrc) return [];
  const lines: { time: number; text: string }[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const matches = raw.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g);
    let lastIndex = 0;
    const times: number[] = [];
    for (const m of matches) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fracRaw = m[3] ?? '0';
      const frac = parseInt(fracRaw.padEnd(3, '0').slice(0, 3), 10) / 1000;
      times.push(min * 60 + sec + frac);
      lastIndex = (m.index ?? 0) + m[0].length;
    }
    const text = raw.slice(lastIndex).trim();
    if (!times.length) continue;
    for (const time of times) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}
