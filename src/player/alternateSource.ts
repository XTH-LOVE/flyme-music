import { searchAllSources } from '@/ai/musicSearch';
import { useAiStore } from '@/store/useAiStore';
import { playerController } from '@/player';
import type { MusicTrack } from '@/music/source/types';

/**
 * "Play from another source": the same song (name + artist) re-searched on
 * the other providers, used when the current source refuses to stream
 * (copyright locks, expired links, risk control). Returns false when no
 * plausible match is found.
 */

function norm(x: string): string {
  return x.toLowerCase().replace(/[\s（）()·・\-—_/\\]/g, '');
}

function artistOverlap(a: string[], b: string[]): boolean {
  const left = a.map(norm).filter(Boolean);
  const right = b.map(norm).filter(Boolean);
  return left.some((x) => right.some((y) => x === y || x.includes(y) || y.includes(x)));
}

export async function findAlternateSource(track: MusicTrack): Promise<MusicTrack | null> {
  const dislikes = useAiStore.getState().dislikes;
  const query = (track.name + ' ' + (track.artist[0] ?? '')).trim();
  const hits = await searchAllSources(query, 12, track.artist[0], dislikes);
  const want = norm(track.name);
  for (const hit of hits) {
    if (hit.source === track.source) continue;
    const name = norm(hit.name);
    const sameSong =
      name === want ||
      name.includes(want) ||
      want.includes(name) ||
      // Strip common parenthetical suffixes on either side before comparing.
      name.replace(/(翻唱|cover|live|版|remix)/g, '') === want.replace(/(翻唱|cover|live|版|remix)/g, '');
    if (sameSong && artistOverlap(hit.artist, track.artist)) return hit;
  }
  return null;
}

/** Find the song on another source and start playing it. */
export async function playFromAlternateSource(track: MusicTrack): Promise<boolean> {
  const alt = await findAlternateSource(track);
  if (!alt) return false;
  playerController.playTracks([alt], 0);
  return true;
}
