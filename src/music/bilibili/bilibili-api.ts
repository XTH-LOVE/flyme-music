import { httpFetch, isTauri } from '@/lib/apiTransport';
import type { MusicTrack } from '@/music/source/types';

/**
 * Bilibili as a music source.
 *
 * Everything goes through our own `/api/bilibili` relay rather than direct to
 * bilibili.com: search answers 412 without a `buvid3` cookie that only the site
 * issues, and the API sends no CORS headers at all. The relay holds the cookie.
 *
 * Playback does *not* need the relay - verified against the live CDN, the audio
 * stream answers 206 with or without a Referer - so the URL is handed straight
 * to the audio element.
 */

const RELAY = '/api/bilibili';
const BILIBILI_API = 'https://api.bilibili.com';
const BILIBILI_HOME = 'https://www.bilibili.com/';

/**
 * Which route to bilibili is even possible.
 *
 * Measured, not assumed: bilibili's risk control answers 412 to every API call
 * from a datacenter IP, so the relay is blocked from Cloudflare (all four
 * endpoints, with and without a device cookie). The packaged app is different -
 * it requests through the user's own connection, which is not on that list, and
 * has no CORS to work around - so it goes direct.
 *
 * The browser has no route: direct calls are blocked by CORS, and the relay is
 * blocked by IP reputation. That case reports why rather than looking broken.
 */
function shouldCallDirectly(): boolean {
  return isTauri();
}

/**
 * The relay could not reach bilibili at all; `reason` is its diagnosis
 * ("blocked" = risk control refused the datacenter IP, etc).
 */
export class BilibiliUnavailableError extends Error {
  constructor(readonly reason: string) {
    super('bilibili unavailable: ' + reason);
    this.name = 'BilibiliUnavailableError';
  }
}

/**
 * Read the relay's {"error":"bilibili unavailable","reason":...} body and
 * surface the reason as a typed throw. Non-JSON error bodies (a 404 page,
 * a dev server without the route) stay silent - there is nothing to say.
 */
async function maybeThrowRelayReason(response: Response): Promise<void> {
  try {
    const body = (await response.json()) as { reason?: string };
    if (typeof body?.reason === 'string') throw new BilibiliUnavailableError(body.reason);
  } catch (e) {
    if (e instanceof BilibiliUnavailableError) throw e;
    /* not JSON: nothing to surface */
  }
}

async function relay<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const direct = shouldCallDirectly();
  const query = new URLSearchParams(params);
  const url = direct
    ? `${BILIBILI_API}${path}?${query.toString()}`
    : `${RELAY}?${new URLSearchParams({ path, ...params }).toString()}`;
  try {
    const response = await httpFetch(url, direct ? { headers: { Referer: BILIBILI_HOME } } : undefined);
    if (!response.ok) {
      // The reason used to be swallowed here, so a risk-controlled web build
      // showed "no results found" for a source it cannot reach at all.
      // Propagate it and let the UI tell the truth instead.
      if (!direct) await maybeThrowRelayReason(response);
      return null;
    }
    return (await response.json()) as T;
  } catch (e) {
    if (e instanceof BilibiliUnavailableError) throw e;
    return null;
  }
}

/** Bilibili wraps matched keywords in <em> tags and HTML-escapes the rest. */
export function cleanTitle(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Search results give duration as "m:ss" or "h:mm:ss". */
export function parseDuration(raw: string | number | undefined): number {
  if (typeof raw === 'number') return raw > 0 ? raw : 0;
  if (!raw) return 0;
  const parts = String(raw)
    .split(':')
    .map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** Covers come back protocol-relative ("//i0.hdslb.com/..."). */
export function normalizeCover(raw: string | undefined): string {
  if (!raw) return '';
  if (raw.startsWith('//')) return 'https:' + raw;
  return raw;
}

interface RawSearchItem {
  bvid?: string;
  title?: string;
  author?: string;
  pic?: string;
  duration?: string;
}

function toTrack(item: RawSearchItem): MusicTrack | null {
  const bvid = item.bvid;
  if (!bvid) return null;
  const name = cleanTitle(item.title ?? '');
  if (!name) return null;
  return {
    id: bvid,
    name,
    artist: item.author ? [item.author] : [],
    album: 'Bilibili',
    // The cover URL travels in pic_id: there is no id-based picture endpoint for
    // bilibili, so the URL from the search result is the only source.
    pic_id: normalizeCover(item.pic),
    url_id: bvid,
    lyric_id: bvid,
    source: 'bilibili',
    duration: parseDuration(item.duration),
  };
}

export async function searchBilibili(
  keyword: string,
  page = 1,
  count = 20,
): Promise<{ items: MusicTrack[]; hasMore: boolean }> {
  const json = await relay<{ code?: number; data?: { result?: RawSearchItem[] } }>(
    '/x/web-interface/search/type',
    { search_type: 'video', keyword, page: String(page) },
  );
  const results = json?.data?.result ?? [];
  const items = results
    .map(toTrack)
    .filter((t): t is MusicTrack => t !== null)
    .slice(0, count);
  // Bilibili returns a full page until it runs out; a short page means the end.
  return { items, hasMore: results.length >= count };
}

interface ViewData {
  cid?: number;
  pages?: Array<{ cid?: number; part?: string }>;
}

/** Resolve the first part's cid, which playurl needs alongside the bvid. */
export async function resolveCid(bvid: string): Promise<number | null> {
  const json = await relay<{ code?: number; data?: ViewData }>('/x/web-interface/view', { bvid });
  const first = json?.data?.pages?.[0]?.cid ?? json?.data?.cid;
  return typeof first === 'number' && first > 0 ? first : null;
}

interface DashAudio {
  id?: number;
  baseUrl?: string;
  base_url?: string;
  bandwidth?: number;
}

/**
 * Pick the highest-quality audio track.
 *
 * Bilibili returns several DASH audio renditions; the element can play any of
 * them, so take the widest bandwidth rather than the first.
 */
export function selectAudioUrl(audios: DashAudio[]): string | null {
  let best: DashAudio | null = null;
  for (const audio of audios) {
    const url = audio.baseUrl ?? audio.base_url;
    if (!url) continue;
    if (!best || (audio.bandwidth ?? 0) > (best.bandwidth ?? 0)) best = audio;
  }
  return best ? (best.baseUrl ?? best.base_url ?? null) : null;
}

export async function resolveBilibiliAudio(bvid: string): Promise<string | null> {
  const cid = await resolveCid(bvid);
  if (!cid) return null;
  const json = await relay<{ code?: number; data?: { dash?: { audio?: DashAudio[] } } }>(
    '/x/player/playurl',
    { bvid, cid: String(cid), fnval: '16', fourk: '1' },
  );
  return selectAudioUrl(json?.data?.dash?.audio ?? []);
}

interface SubtitleLine {
  from?: number;
  content?: string;
}

/**
 * Bilibili subtitles as lyrics.
 *
 * Only some videos carry them, and they are plain sentences rather than timed
 * lyric lines, so this returns LRC-shaped text built from the subtitle timings.
 * A missing subtitle is normal, not an error.
 */
export async function resolveBilibiliLyric(bvid: string): Promise<string | null> {
  const cid = await resolveCid(bvid);
  if (!cid) return null;
  const json = await relay<{
    data?: { subtitle?: { subtitles?: Array<{ subtitle_url?: string }> } };
  }>('/x/player/v2', { bvid, cid: String(cid) });
  const url = json?.data?.subtitle?.subtitles?.[0]?.subtitle_url;
  if (!url) return null;
  try {
    // Subtitle JSON lives on a CDN that allows direct reads.
    const response = await httpFetch(url.startsWith('//') ? 'https:' + url : url);
    if (!response.ok) return null;
    const body = (await response.json()) as { body?: SubtitleLine[] };
    const lines = (body.body ?? [])
      .filter((line) => line.content && typeof line.from === 'number')
      .map((line) => {
        const total = Math.max(0, line.from ?? 0);
        const minutes = Math.floor(total / 60);
        const seconds = (total % 60).toFixed(2).padStart(5, '0');
        return `[${String(minutes).padStart(2, '0')}:${seconds}]${(line.content ?? '').trim()}`;
      });
    return lines.length ? lines.join('\n') : null;
  } catch {
    return null;
  }
}
