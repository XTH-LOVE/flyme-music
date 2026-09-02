import type { MusicProvider } from '../provider';
import type { Lyrics, RecommendData, SearchPageResult } from '../types-search';
import type { MusicTrack } from '../source/types';
import { songToTrack } from '../source/types';
import {
  fallbackLyrics,
  mockAlbums,
  mockArtists,
  mockCharts,
  mockHotKeywords,
  mockLyricsMap,
  mockPlaylists,
  mockSongs,
} from './data';

/** Local, offline-first provider backed by mock data. */
export class MockMusicProvider implements MusicProvider {
  readonly id = 'mock';
  readonly name = 'Aurora Mock';

  async getRecommend(): Promise<RecommendData> {
    return {
      banners: mockPlaylists.slice(0, 2),
      recommendedPlaylists: mockPlaylists.slice(0, 6),
      hotPlaylists: [...mockPlaylists].sort((a, b) => b.plays - a.plays).slice(0, 4),
      newSongs: mockSongs.slice(6, 12),
      recentSongs: mockSongs.slice(0, 6),
    };
  }

  async searchTracks(
    keyword: string,
    _page = 1,
    _count = 30,
  ): Promise<SearchPageResult<MusicTrack>> {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return { items: [], hasMore: false };
    const match = (text: string) => text.toLowerCase().includes(kw);
    const items = mockSongs
      .filter((s) => match(s.title) || match(s.artistName) || match(s.albumName))
      .map(songToTrack);
    return { items, hasMore: false };
  }

  async getSong(id: string) {
    return mockSongs.find((s) => s.id === id);
  }

  async getSongs(ids: string[]) {
    return ids
      .map((id) => mockSongs.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
  }

  async getAlbum(id: string) {
    const album = mockAlbums.find((a) => a.id === id);
    if (!album) return undefined;
    return { album, songs: mockSongs.filter((s) => s.albumId === id) };
  }

  async getAllAlbums() {
    return mockAlbums;
  }

  async getArtist(id: string) {
    const artist = mockArtists.find((a) => a.id === id);
    if (!artist) return undefined;
    const songs = mockSongs.filter((s) => s.artistId === id);
    const albums = mockAlbums.filter((a) => a.artistId === id);
    return { artist, hotSongs: songs, albums };
  }

  async getAllArtists() {
    return mockArtists;
  }

  async getPlaylist(id: string) {
    const playlist = mockPlaylists.find((p) => p.id === id);
    if (!playlist) return undefined;
    return { playlist, songs: await this.getSongs(playlist.songIds) };
  }

  async getAllPlaylists() {
    return mockPlaylists;
  }

  async getLyrics(songId: string): Promise<Lyrics> {
    const authored = mockLyricsMap[songId];
    if (authored) return authored;
    const song = mockSongs.find((s) => s.id === songId);
    return song ? fallbackLyrics(song) : [];
  }

  async getCharts() {
    return mockCharts;
  }

  async getHotKeywords() {
    return mockHotKeywords;
  }
}
