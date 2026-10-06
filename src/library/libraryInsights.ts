import type { MusicTrack } from '@/music/source/types';

export interface LibraryInsights {
  tracks: number;
  albums: number;
  artists: number;
  formats: Record<string, number>;
  sources: Record<string, number>;
  totalDuration: number;
  totalBytes: number;
}

export function buildLibraryInsights(tracks: MusicTrack[], sizes: Record<string, number> = {}): LibraryInsights {
  const albums = new Set<string>();
  const artists = new Set<string>();
  const formats: Record<string, number> = {};
  const sources: Record<string, number> = {};
  let totalDuration = 0;
  let totalBytes = 0;
  for (const track of tracks) {
    if (track.album) albums.add(track.album);
    track.artist.forEach((artist) => artists.add(artist));
    sources[track.source] = (sources[track.source] ?? 0) + 1;
    const extension = track.name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ?? 'stream';
    formats[extension] = (formats[extension] ?? 0) + 1;
    totalDuration += track.duration ?? 0;
    totalBytes += sizes[track.id] ?? 0;
  }
  return { tracks: tracks.length, albums: albums.size, artists: artists.size, formats, sources, totalDuration, totalBytes };
}
