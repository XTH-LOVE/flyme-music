import { getTrackProvider } from '@/music/source/factory';
import type { MusicSource, MusicTrack } from '@/music/source/types';

/** Words that mark a non-original version of a song. */
const COVER_WORDS = [
  '翻唱', 'カバー', 'cover', 'live', '伴奏', '钢琴版', '纯音乐版',
  '加速版', '减速版', 'dj版', 'remix', '铃声', '片段', '清唱', '饭拍', '串烧', '原唱',
];

/** Common Traditional → Simplified folds (Joox metadata is Traditional). */
const T2S: Record<string, string> = {
  傑: '杰', 倫: '伦', 華: '华', 國: '国', 樂: '乐', 東: '东', 張: '张', 陳: '陈',
  榮: '荣', 喆: '哲', 鄧: '邓', 學: '学', 蕭: '萧', 騰: '腾', 鋒: '锋', 雲: '云',
  慶: '庆', 憲: '宪', 彥: '彦', 堯: '尧', 強: '强', 偉: '伟', 堅: '坚', 藍: '蓝',
  麗: '丽', 蘭: '兰', 鳳: '凤', 漢: '汉', 龍: '龙', 馬: '马', 歐: '欧', 陽: '阳',
  葉: '叶', 傳: '传', 紅: '红', 廣: '广', 藝: '艺', 飛: '飞', 風: '风', 澤: '泽',
  優: '优', 戀: '恋', 語: '语', 詩: '诗', 謠: '谣', 夢: '梦', 靈: '灵', 聽: '听',
  韻: '韵', 覺: '觉', 遙: '遥', 畫: '画', 響: '响', 島: '岛', 橋: '桥', 駱: '骆',
};

/** Normalize text for comparison: lowercase, drop whitespace and decorative
 *  symbols (fake artists hide behind ♚/★), fold Traditional to Simplified. */
function norm(x: string): string {
  return x
    .toLowerCase()
    .replace(/[♚★☆♪♫✦✧·・\s–—()（）-]/g, '')
    .split('')
    .map((c) => T2S[c] ?? c)
    .join('');
}

/**
 * Score a search hit against the user's query.
 * Original studio versions rank above covers/live/instrumentals.
 */
export function scoreTrack(track: MusicTrack, query: string, artistHint?: string, dislikes?: string[]): number {
  let s = 0;
  const name = norm(track.name);
  const q = norm(query);
  const artists = norm(track.artist.join(' '));
  const tokens = query.toLowerCase().split(/\s+/).map(norm).filter(Boolean);
  if (tokens.length > 1) {
    // Multi-word query like "周杰伦 晴天": the true original matches BOTH
    // an artist token and a title token; title-only hits are covers.
    const nameHit = tokens.some((tk) => name.includes(tk));
    const artistHit = tokens.some((tk) => artists.includes(tk));
    if (artistHit && nameHit) s += 6;
    else if (artistHit) s += 3;
    else if (nameHit) s -= 3;
  } else if (q) {
    if (name === q) s += 5;
    else if (name.includes(q) || q.includes(name)) s += 2;
  }
  if (artistHint && artists.includes(norm(artistHint))) s += 4;
  for (const w of COVER_WORDS) {
    if (name.includes(norm(w))) {
      s -= 6;
      break;
    }
  }
  if (dislikes?.length) {
    for (const d of dislikes) {
      const nd = norm(d);
      if (artists.includes(nd) || name.includes(nd)) s -= 10;
    }
  }
  if (track.duration && track.duration > 30 && track.duration < 600) s += 1;
  return s;
}

/** Same song across sources collapses to one entry - name plus artist line. */
export const dedupeKey = (t: MusicTrack) => norm(t.name + '|' + t.artist.join('/'));

/**
 * Search netease + joox in parallel, merge, dedupe and rank with
 * original-preferred scoring. Fixes the "only covers found" problem
 * caused by querying a single source.
 */
export async function searchAllSources(
  keyword: string,
  count = 10,
  artistHint?: string,
  dislikes?: string[],
  /**
   * Extra providers to search alongside the default pair. The source fallback
   * passes Hi歌 here: netease and joox both go through the same GD aggregator,
   * so an outage there would take out the fallback search too - Hi歌 scrapes
   * its own site and streams from a different CDN, which is the only genuinely
   * independent option. Kept opt-in so ordinary searches do not hit it.
   */
  extraSources: MusicSource[] = [],
): Promise<MusicTrack[]> {
  const kw = keyword.trim();
  if (!kw) return [];
  const sources: MusicSource[] = ['netease', 'joox', ...extraSources];
  const results = await Promise.allSettled(
    sources.map((source) => getTrackProvider(source).search(kw, 1, Math.max(count, 12))),
  );
  const merged: MusicTrack[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const t of r.value.items) {
      const key = dedupeKey(t);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(t);
    }
  }
  merged.sort((a, b) => scoreTrack(b, kw, artistHint, dislikes) - scoreTrack(a, kw, artistHint, dislikes));
  return merged.slice(0, count);
}

/** Sources behind the search page's "全部" tab, roughly by catalogue size. */
export const AGGREGATE_SOURCES: MusicSource[] = ['netease', 'qq', 'kuwo', 'joox', 'higequ'];

export interface AggregateSearchResult {
  items: MusicTrack[];
  hasMore: boolean;
}

/**
 * Fan-out search for the search page's "全部" tab.
 *
 * Unlike searchAllSources this is page-aware and returns the whole merged list
 * for that page rather than a relevance-trimmed top-N, so "加载更多" stays
 * consistent: aggregate page N is page N of every source, merged.
 *
 * Hi歌 is included even though it is a scrape and noticeably slower than the
 * rest - dropping it would silently hide the one provider that does not sit
 * behind the GD aggregator, which is exactly the source worth having when that
 * aggregator is having a bad day. A failed source is skipped rather than
 * emptying the result.
 */
/**
 * Per-source budget. A scrape can hang for its full 15s network timeout, and
 * allSettled waits for every source, so one slow provider would stall the whole
 * search. Bounded here; a source that misses the budget is simply absent from
 * this page.
 */
const AGGREGATE_SOURCE_TIMEOUT_MS = 3500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('source timed out')), ms);
    }),
  ]);
}

export async function aggregateSearch(
  keyword: string,
  page = 1,
  count = 20,
  signal?: AbortSignal,
): Promise<AggregateSearchResult> {
  const kw = keyword.trim();
  if (!kw || signal?.aborted) return { items: [], hasMore: false };

  const settled = await Promise.allSettled(
    AGGREGATE_SOURCES.map((source) =>
      withTimeout(getTrackProvider(source).search(kw, page, count, signal), AGGREGATE_SOURCE_TIMEOUT_MS),
    ),
  );

  const merged: MusicTrack[] = [];
  const seen = new Set<string>();
  let hasMore = false;
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    if (result.value.hasMore) hasMore = true;
    for (const track of result.value.items) {
      const key = dedupeKey(track);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(track);
    }
  }

  merged.sort((a, b) => scoreTrack(b, kw) - scoreTrack(a, kw));
  // Trim to one page. Returning every source's full page meant ~100 rows, each
  // needing its own cover request - the artwork visibly trickled in. Same page
  // size as the single-source tabs; 加载更多 fetches the next one.
  return { items: merged.slice(0, count), hasMore: hasMore || merged.length > count };
}

/** How many obvious covers/live versions were pushed down by ranking. */
export function countSkippedCovers(tracks: MusicTrack[], query: string): number {
  return tracks.filter((t) => {
    const name = t.name.toLowerCase();
    return COVER_WORDS.some((w) => name.includes(w.toLowerCase())) && scoreTrack(t, query) < 0;
  }).length;
}
