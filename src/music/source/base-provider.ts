import type { MusicSource, MusicTrack, RawApiTrack, SearchPageResult, SongLyric } from './types';
import { normalizeTrack, requestMusicApiJSON } from './provider-utils';
import { toSimplified } from '@/utils/t2s';

/**
 * Base provider for GD-API backed sources (same shape as Otter's BaseMusicProvider).
 * Concrete sources only need to declare their `source` id.
 */
export abstract class BaseMusicProvider {
  abstract source: MusicSource;

  async search(
    query: string,
    page: number,
    count: number,
    signal?: AbortSignal,
  ): Promise<SearchPageResult<MusicTrack>> {
    const json = await requestMusicApiJSON<RawApiTrack[]>(
      { types: 'search', source: this.source, name: query, count, pages: page },
      signal,
    );
    let items = json.map((t) => normalizeTrack(t, this.source));
    if (this.source === 'joox') {
      items = await Promise.all(
        items.map(async (item) => ({
          ...item,
          name: await toSimplified(item.name),
          album: await toSimplified(item.album),
          artist: await Promise.all(item.artist.map((a) => toSimplified(a))),
        })),
      );
    }
    return { items, hasMore: items.length === count };
  }

  async getUrl(track: MusicTrack, br = 192): Promise<string | null> {
    const json = await requestMusicApiJSON<{ url?: string }>({
      types: 'url',
      source: this.source,
      id: track.url_id,
      br,
    });
    return json.url || null;
  }

  async getPic(track: MusicTrack, size = 800): Promise<string | null> {
    const json = await requestMusicApiJSON<{ url?: string }>({
      types: 'pic',
      source: this.source,
      id: track.pic_id,
      size,
    });
    return json.url || null;
  }

  async getLyric(track: MusicTrack): Promise<SongLyric | null> {
    const json = await requestMusicApiJSON<{ lyric?: string; tlyric?: string }>({
      types: 'lyric',
      source: this.source,
      id: track.lyric_id,
    });
    const lyric = this.source === 'joox' ? await toSimplified(json.lyric ?? '') : json.lyric ?? '';
    return { lyric, tlyric: json.tlyric ?? '' };
  }
}
