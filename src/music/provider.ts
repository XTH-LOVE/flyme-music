import type {
  Album,
  Artist,
  Chart,
  Lyrics,
  Playlist,
  RecommendData,
  Song,
} from './types';
import type { MusicTrack, SearchPageResult } from './source/types';

/**
 * Library provider contract (browse/detail surfaces).
 * Online search & playback live in the source system (src/music/source),
 * mirroring Otter Music's split between library data and music sources.
 */
export interface MusicProvider {
  readonly id: string;
  readonly name: string;

  getRecommend(): Promise<RecommendData>;
  searchTracks(
    keyword: string,
    page?: number,
    count?: number,
    signal?: AbortSignal,
  ): Promise<SearchPageResult<MusicTrack>>;

  getSong(id: string): Promise<Song | undefined>;
  getSongs(ids: string[]): Promise<Song[]>;

  getAlbum(id: string): Promise<{ album: Album; songs: Song[] } | undefined>;
  getAllAlbums(): Promise<Album[]>;

  getArtist(
    id: string,
  ): Promise<{ artist: Artist; hotSongs: Song[]; albums: Album[] } | undefined>;
  getAllArtists(): Promise<Artist[]>;

  getPlaylist(id: string): Promise<{ playlist: Playlist; songs: Song[] } | undefined>;
  getAllPlaylists(): Promise<Playlist[]>;

  getLyrics(songId: string): Promise<Lyrics>;
  getCharts(): Promise<Chart[]>;
  getHotKeywords(): Promise<string[]>;
}
