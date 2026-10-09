import type {
  NetAlbumMatch,
  NetArtistMatch,
  NetPlaylistMatch,
  NetSearchMeta,
  NetSongMatch,
} from './netease-api';

export type SearchSuggestion =
  | { type: 'artist'; item: NetArtistMatch }
  | { type: 'song'; item: NetSongMatch }
  | { type: 'album'; item: NetAlbumMatch }
  | { type: 'playlist'; item: NetPlaylistMatch };

export function flattenSearchSuggestions(meta: NetSearchMeta): SearchSuggestion[] {
  return [
    ...meta.artists.map((item) => ({ type: 'artist' as const, item })),
    ...meta.songs.map((item) => ({ type: 'song' as const, item })),
    ...meta.albums.map((item) => ({ type: 'album' as const, item })),
    ...meta.playlists.map((item) => ({ type: 'playlist' as const, item })),
  ];
}
