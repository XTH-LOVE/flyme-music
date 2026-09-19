import { BaseMusicProvider } from '../base-provider';
import type { MusicSource, MusicTrack, SearchPageResult, SongLyric } from '../types';
import {
  resolveBilibiliAudio,
  resolveBilibiliLyric,
  searchBilibili,
} from '@/music/bilibili/bilibili-api';

/**
 * Bilibili source.
 *
 * Overrides all four base methods: this source does not go through the GD
 * aggregator at all, so none of the inherited implementations apply. Search and
 * playback go through our own relay because bilibili needs a `buvid3` cookie and
 * sends no CORS headers; see src/music/bilibili/bilibili-api.ts.
 *
 * Lyrics come from the video's subtitles when it has any, which most music
 * uploads do not - a null lyric is the normal case here, not a failure.
 */
export class BilibiliProvider extends BaseMusicProvider {
  source = 'bilibili' as MusicSource;

  async search(query: string, page: number, count: number): Promise<SearchPageResult<MusicTrack>> {
    return searchBilibili(query, page, count);
  }

  async getUrl(track: MusicTrack): Promise<string | null> {
    return resolveBilibiliAudio(track.url_id || track.id);
  }

  async getPic(track: MusicTrack): Promise<string | null> {
    // The search result already carried the cover URL; there is no id-based
    // picture endpoint to fall back to.
    return track.pic_id && /^https?:/.test(track.pic_id) ? track.pic_id : null;
  }

  async getLyric(track: MusicTrack): Promise<SongLyric | null> {
    const lyric = await resolveBilibiliLyric(track.lyric_id || track.id);
    return lyric ? { lyric, tlyric: '' } : null;
  }
}
