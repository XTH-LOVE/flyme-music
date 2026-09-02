import type { MusicSource, MusicTrack, SearchPageResult, SongLyric } from '../types';
import { songToTrack } from '../types';
import { mockSongs } from '@/music/mock/data';
import { fallbackLyrics } from '@/music/mock/data';

/** Local demo library exposed through the same source contract. */
export class MockTrackProvider {
  source = 'mock' as MusicSource;

  async search(
    query: string,
    _page: number,
    _count: number,
  ): Promise<SearchPageResult<MusicTrack>> {
    const kw = query.trim().toLowerCase();
    const items = kw
      ? mockSongs
          .filter(
            (s) =>
              s.title.toLowerCase().includes(kw) ||
              s.artistName.toLowerCase().includes(kw) ||
              s.albumName.toLowerCase().includes(kw),
          )
          .map(songToTrack)
      : [];
    return { items, hasMore: false };
  }

  /** Local tracks carry no remote stream. */
  async getUrl(): Promise<string | null> {
    return null;
  }

  async getPic(): Promise<string | null> {
    return null;
  }

  async getLyric(track: MusicTrack): Promise<SongLyric | null> {
    const song = mockSongs.find((s) => s.id === track.id);
    if (!song) return { lyric: '' };
    const lines = fallbackLyrics(song);
    return {
      lyric: lines.map((l) => '[' + formatLrcTime(l.time) + ']' + l.text).join('\n'),
    };
  }
}

function formatLrcTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.00';
}
