import { requestMusicApiJSON, requestStreamUrl } from './provider-utils';
import type { MusicTrack, RawApiTrack } from './types';

/**
 * Resolve a playable stream by re-finding the song on Joox.
 *
 * Two sources need this because their own stream endpoint does not yield a
 * playable URL:
 *
 * - QQ: vkey streams are login/VIP-gated, while Joox streams are open.
 * - Kuwo: the aggregator returns `{"url":"","br":-1,"size":0}` for every kuwo
 *   id at every bitrate (measured across multiple ids and bitrates), so search
 *   works but playback never resolves.
 *
 * Matching is by normalised song name plus the first artist, which is
 * deliberately loose - the same song is often a slightly different edit across
 * catalogues. A wrong-but-similar match is still better than silence, and the
 * caller can always pick another track.
 */

const norm = (value: string) => value.toLowerCase().replace(/[\s()（）《》.,!?'"-]/g, '');

/** Stream links expire, so cache briefly. */
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { url: string; expiresAt: number }>();

export async function resolveViaJoox(track: MusicTrack, br = 192): Promise<string | null> {
  // Key by source:id - bare numeric ids collide across catalogues.
  const key = track.source + ':' + track.id;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  if (cached) cache.delete(key);

  try {
    const query = track.name + ' ' + (track.artist[0] ?? '');
    const results = await requestMusicApiJSON<RawApiTrack[]>({
      types: 'search',
      source: 'joox',
      name: query,
      count: 5,
      pages: 1,
    });
    if (!results.length) return null;

    const target = norm(track.name);
    const pick = results.find((r) => norm(r.name) === target) ?? results[0];
    // Goes through the shared ladder, so a lossless request still resolves when
    // the aggregator refuses that bitrate for Joox.
    const url = await requestStreamUrl('joox', pick.url_id, br);
    if (!url) return null;

    cache.set(key, { url, expiresAt: Date.now() + TTL_MS });
    return url;
  } catch {
    return null;
  }
}
