import { create } from 'zustand';
import { deleteLocalTrack, getAllLocalTracks, importLocalFiles } from '@/library/localLibrary';
import type { MusicTrack } from '@/music/source/types';

interface LocalLibraryState {
  tracks: MusicTrack[];
  /** True while the startup IndexedDB read is in flight. */
  loading: boolean;
  importFiles: (files: File[]) => Promise<{ imported: number; skipped: number }>;
  remove: (track: MusicTrack) => Promise<void>;
  reload: () => Promise<void>;
}

/** User-imported local audio files (IndexedDB backed). */
export const useLocalLibraryStore = create<LocalLibraryState>((set, get) => ({
  tracks: [],
  loading: true,

  importFiles: async (files) => {
    const result = await importLocalFiles(files);
    await get().reload();
    return result;
  },

  remove: async (track) => {
    await deleteLocalTrack(track);
    set({ tracks: get().tracks.filter((t) => t.id !== track.id) });
  },

  reload: async () => {
    set({ tracks: await getAllLocalTracks(), loading: false });
  },
}));

// Load the library once at module init; the page just reads the store.
void useLocalLibraryStore.getState().reload();
