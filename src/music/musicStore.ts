import { useEffect, useMemo, useState } from 'react';
import { getMusicProvider } from './musicService';
import { songToTrack } from './source/types';
import type { MusicTrack } from './source/types';
import type { Song } from './types';

/**
 * Tiny async-data hooks over the active provider.
 * Keeps pages free of provider plumbing.
 */
export function useProviderData<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[] = [],
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loader()
      .then((result) => {
        if (alive) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((e) => {
        // Surface failures instead of spinning forever.
        if (alive) {
          setData(null);
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1) };
}

export function useRecommend() {
  return useProviderData(() => getMusicProvider().getRecommend());
}

export function useAlbum(id: string | undefined) {
  return useProviderData(
    () => (id ? getMusicProvider().getAlbum(id) : Promise.resolve(undefined)),
    [id],
  );
}

export function useArtist(id: string | undefined) {
  return useProviderData(
    () => (id ? getMusicProvider().getArtist(id) : Promise.resolve(undefined)),
    [id],
  );
}

export function usePlaylist(id: string | undefined) {
  return useProviderData(
    () => (id ? getMusicProvider().getPlaylist(id) : Promise.resolve(undefined)),
    [id],
  );
}

export function useCharts() {
  return useProviderData(() => getMusicProvider().getCharts());
}

export function useAllAlbums() {
  return useProviderData(() => getMusicProvider().getAllAlbums());
}

export function useAllArtists() {
  return useProviderData(() => getMusicProvider().getAllArtists());
}

export function useAllPlaylists() {
  return useProviderData(() => getMusicProvider().getAllPlaylists());
}

export function useSongs(ids: string[] | undefined) {
  const key = (ids ?? []).join(',');
  return useProviderData(
    () => (ids ? getMusicProvider().getSongs(ids) : Promise.resolve([])),
    [key],
  );
}

/** Stable Song[] -> MusicTrack[] conversion for track-based UI. */
export function useTracks(songs: Song[] | null | undefined): MusicTrack[] {
  return useMemo(() => (songs ?? []).map(songToTrack), [songs]);
}
