import { parseLrc } from '@/music/source/provider-utils';
import { getTrackProvider } from '@/music/source/factory';
import type { MusicTrack } from '@/music/source/types';

export interface MiniLyricLine {
  time: number;
  text: string;
  trans?: string;
}

const cache = new Map<string, MiniLyricLine[]>();
const inflight = new Map<string, Promise<MiniLyricLine[]>>();

/** Attach each translation line to the nearest original line (±0.8s). */
function mergeLines(main: MiniLyricLine[], transLines: MiniLyricLine[]): MiniLyricLine[] {
  if (!transLines.length) return main;
  return main.map((line) => {
    let best: MiniLyricLine | null = null;
    let bestDiff = 0.8;
    for (const t of transLines) {
      if (!t.text.trim()) continue;
      const diff = Math.abs(t.time - line.time);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = t;
      }
    }
    return best ? { ...line, trans: best.text ?? '' } : line;
  });
}

/** Direct music.163.com lyric via the local weapi proxy (fast lane). */
async function neteaseWeapiLyric(id: string): Promise<MiniLyricLine[]> {
  const res = await fetch('/api/netease/weapi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: '/weapi/song/lyric',
      data: { id, lv: -1, tv: -1, kv: -1 },
    }),
  });
  if (!res.ok) return [];
  const j = (await res.json()) as {
    lrc?: { lyric?: string };
    tlyric?: { lyric?: string };
  };
  const lrc = j?.lrc?.lyric;
  if (!lrc) return [];
  return mergeLines(parseLrc(lrc), j?.tlyric?.lyric ? parseLrc(j.tlyric.lyric) : []);
}

async function providerLyric(track: MusicTrack): Promise<MiniLyricLine[]> {
  const sl = await getTrackProvider(track.source).getLyric(track);
  const main = sl ? parseLrc(sl.lyric) : [];
  const trans = sl?.tlyric ? parseLrc(sl.tlyric) : [];
  return mergeLines(main, trans);
}

/** Race candidate fetchers; first NON-EMPTY result wins. */
function raceLyrics(racers: Promise<MiniLyricLine[]>[]): Promise<MiniLyricLine[]> {
  return new Promise((resolve) => {
    let pending = racers.length;
    let done = false;
    if (!pending) {
      resolve([]);
      return;
    }
    racers.forEach((p) =>
      p
        .then((lines) => {
          if (!done && lines.length) {
            done = true;
            resolve(lines);
          }
          pending -= 1;
          if (pending === 0 && !done) resolve([]);
        })
        .catch(() => {
          pending -= 1;
          if (pending === 0 && !done) resolve([]);
        }),
    );
  });
}

/**
 * Shared lyric fetcher (mini player, PiP and the player lyrics view all use
 * this single cache + in-flight dedupe, so a track is only fetched once).
 * Netease runs a two-lane race: GD API vs direct weapi - first content wins.
 */
export async function fetchLyricLines(track: MusicTrack): Promise<MiniLyricLine[]> {
  const key = track.source + ':' + track.id;
  const hit = cache.get(key);
  if (hit) return hit;
  const running = inflight.get(key);
  if (running) return running;

  const racers: Promise<MiniLyricLine[]>[] = [providerLyric(track)];
  if (track.source === 'netease' && /^\d+$/.test(track.id)) {
    racers.push(neteaseWeapiLyric(track.id));
  }
  const promise = raceLyrics(racers).then((lines) => {
    inflight.delete(key);
    if (lines.length) cache.set(key, lines);
    return lines;
  });
  inflight.set(key, promise);
  return promise;
}

/** Find the active lyric line for a timestamp. */
export function lyricLineAt(lines: MiniLyricLine[], time: number): MiniLyricLine | null {
  let active: MiniLyricLine | null = null;
  for (const line of lines) {
    if (line.time <= time) active = line;
    else break;
  }
  return active;
}
