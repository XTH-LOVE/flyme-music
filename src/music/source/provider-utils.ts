import type { MusicSource, MusicTrack, RawApiTrack } from './types';
import { forceHttps } from './types';
import {
  fetchWithTimeout,
  getOrderedMusicApiUrls,
  markMusicApiUrlFailure,
  markMusicApiUrlSuccess,
} from './api-config';
import { MusicRequestError, classifyMusicRequestError } from './requestError';

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
  e === 'Request cancelled' ||
  ((e instanceof Error ||
    (typeof DOMException !== 'undefined' && e instanceof DOMException)) &&
    ((e as Error).name === 'AbortError' || e.message === 'Request cancelled'));

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
  let res: Response;
  try {
    res = await fetchWithTimeout(url, signal ? { signal } : {});
  } catch (error) {
    throw classifyMusicRequestError(error);
  }
  if (!res.ok) {
    const code = res.status === 401
      ? 'auth-expired'
      : res.status === 403
        ? 'permission-denied'
        : res.status === 404
          ? 'not-found'
          : res.status >= 500
            ? 'server'
            : 'unknown';
    throw new MusicRequestError(code, 'HTTP ' + res.status + ': ' + res.statusText, {
      status: res.status,
      endpoint: url,
    });
  }
  try {
    return (await res.json()) as T;
  } catch (error) {
    throw new MusicRequestError('invalid-response', '音乐接口返回了无效数据', {
      endpoint: url,
      cause: error,
    });
  }
}

async function waitBeforeRetry(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      settled = true;
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      globalThis.clearTimeout(timer);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/** Retry only transient failures, with a short bounded exponential backoff. */
async function requestJSONWithRetry<T>(
  url: string,
  signal?: AbortSignal,
  maxAttempts = 2,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await requestJSON<T>(url, signal);
    } catch (error) {
      const classified = classifyMusicRequestError(error);
      lastError = classified;
      if (!classified.retryable || attempt === maxAttempts - 1) throw classified;
      await waitBeforeRetry(250 * (attempt + 1), signal);
    }
  }
  throw lastError ?? new Error('音乐接口请求失败');
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
      const result = await requestJSONWithRetry<T>(url, signal);
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

/**
 * Bitrates to step down through when the requested one yields nothing.
 *
 * Measurements against the aggregator's `url` endpoint, and what they imply:
 *
 * - Different bitrates can fail independently. In one window a single Joox
 *   track resolved 0/8 at 999 (lossless) while the same track resolved 7/8 at
 *   128. Since the app's default quality is lossless, that alone made playback
 *   fail - so stepping down is worth doing.
 * - Retrying the *same* bitrate is not. An interleaved test (12 rounds each)
 *   gave 4/12 for a single 999 request and 4/12 for the full ladder, and six
 *   different songs failed in the same window. Failures are largely temporal:
 *   when the upstream is having a bad minute, every bitrate fails together.
 *
 * Hence one attempt per bitrate, four requests worst case. Burning more
 * attempts would only add load to an endpoint that is already struggling.
 */
/**
 * Two rungs, not four. Every rung is a full network round-trip (~0.5-1.4s each),
 * so a four-rung ladder made a song that would not resolve take roughly five
 * seconds before falling back to another source. Two rungs still covers the
 * ordinary case - the requested bitrate, then one widely supported fallback -
 * while keeping the worst case tolerable.
 */
const URL_BR_LADDER = [320, 128];

/**
 * Resolve a stream url for a source, stepping the bitrate down when a rung
 * yields nothing. Only ever steps downwards: silently returning a *higher*
 * bitrate than the caller asked for would be a surprise, and the ladder covers
 * the useful range.
 */
export async function requestStreamUrl(
  source: MusicSource,
  id: string,
  br: number,
): Promise<string | null> {
  const ladder = URL_BR_LADDER.filter((candidate) => candidate <= br);
  if (!ladder.includes(br)) ladder.unshift(br);

  for (const candidate of ladder) {
    try {
      const json = await requestMusicApiJSON<{ url?: string }>({
        types: 'url',
        source,
        id,
        br: candidate,
      });
      if (json.url) return json.url;
    } catch {
      // The endpoint occasionally answers with an HTML error page instead of
      // JSON, which throws on parse. Treat it as this rung failing rather than
      // letting it abort the whole resolution.
    }
  }
  return null;
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
