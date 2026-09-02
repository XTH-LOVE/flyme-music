import { getTrackProvider } from '@/music/source/factory';
import type { MusicTrack } from '@/music/source/types';

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

const dedupeKey = (t: MusicTrack) => norm(t.name + '|' + t.artist.join('/'));

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
): Promise<MusicTrack[]> {
  const kw = keyword.trim();
  if (!kw) return [];
  const results = await Promise.allSettled([
    getTrackProvider('netease').search(kw, 1, Math.max(count, 12)),
    getTrackProvider('joox').search(kw, 1, Math.max(count, 12)),
  ]);
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

/** How many obvious covers/live versions were pushed down by ranking. */
export function countSkippedCovers(tracks: MusicTrack[], query: string): number {
  return tracks.filter((t) => {
    const name = t.name.toLowerCase();
    return COVER_WORDS.some((w) => name.includes(w.toLowerCase())) && scoreTrack(t, query) < 0;
  }).length;
}
