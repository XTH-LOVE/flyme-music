/** Core music domain types. */

export interface Artist {
  id: string;
  name: string;
  /** Gradient palette used to render the local avatar. */
  palette: [string, string];
  bio: string;
  followers: number;
}

export interface Album {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  year: number;
  /** Gradient palette rendered as the local cover art. */
  palette: [string, string];
  description: string;
}

export interface Song {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  albumId: string;
  albumName: string;
  /** Seconds. */
  duration: number;
  /** Palette of the song's cover (inherits album art). */
  palette: [string, string];
  /**
   * Real audio source. When absent the engine falls back to
   * simulated playback so the UI works fully offline.
   */
  audioUrl?: string;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  palette: [string, string];
  songIds: string[];
  plays: number;
}

export interface LyricLine {
  /** Seconds from song start. */
  time: number;
  text: string;
}

export type Lyrics = LyricLine[];

export interface Chart {
  id: string;
  title: string;
  subtitle: string;
  palette: [string, string];
  songIds: string[];
}

export interface RecommendData {
  banners: Playlist[];
  recommendedPlaylists: Playlist[];
  hotPlaylists: Playlist[];
  newSongs: Song[];
  recentSongs: Song[];
}

export interface SearchResult {
  songs: Song[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
}
