/**
 * Source-system track model (mirrors Otter Music's MusicTrack).
 * A track is identified by its source + id triple (pic/url/lyric ids),
 * concrete media is resolved lazily through the owning provider.
 */
import type { Song } from '../types';

export type MusicSource = 'netease' | 'joox' | 'qq' | 'mock';

export interface MusicTrack {
  id: string;
  name: string;
  artist: string[];
  album: string;
  pic_id: string;
  url_id: string;
  lyric_id: string;
  source: MusicSource;
  /** Seconds; 0 until resolved for remote tracks. */
  duration?: number;
  /** Gradient art for local (mock) tracks. */
  palette?: [string, string];
  /** Eagerly resolved cover (real covers for remote tracks). */
  picUrl?: string;
  fee?: number;
  update_time?: number;
  is_deleted?: boolean;
}

/** Raw row returned by the GD music API. */
export interface RawApiTrack {
  id: string | number;
  name: string;
  artist: string | string[];
  album: string;
  pic_id: string;
  url_id: string;
  lyric_id: string;
  artist_ids?: string[];
  album_id?: string;
}

export interface SearchPageResult<T = MusicTrack> {
  items: T[];
  hasMore: boolean;
}

export interface SongLyric {
  lyric: string;
  tlyric?: string;
}

export interface SourceOption {
  source: MusicSource;
  label: string;
}

/** Searchable sources shown in the UI (QQ is browse-only via charts). */
export const searchSourceOptions: SourceOption[] = [
  { source: 'netease', label: '网易云' },
  { source: 'joox', label: 'Joox' },
  { source: 'mock', label: '本地曲库' },
];

export const sourceLabels: Record<MusicSource, string> = {
  netease: '网易',
  qq: 'QQ',
  joox: 'Joox',
  mock: '本地',
};

/** Every Song in this app is also a MusicTrack (local songs use source 'mock'). */
export function songToTrack(song: Song): MusicTrack {
  return {
    id: song.id,
    name: song.title,
    artist: [song.artistName],
    album: song.albumName,
    pic_id: song.id,
    url_id: song.id,
    lyric_id: song.id,
    source: 'mock',
    duration: song.duration,
    palette: song.palette,
  };
}

export function forceHttps(url?: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  return url.replace(/^http:/, 'https:');
}
