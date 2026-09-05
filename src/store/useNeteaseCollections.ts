import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface NeteaseCollection {
  id: string;
  name: string;
  coverUrl?: string;
  creator?: string;
  addedAt: number;
}

interface NeteaseCollectionsState {
  items: NeteaseCollection[];
  toggle: (item: Omit<NeteaseCollection, 'addedAt'>) => void;
  remove: (id: string) => void;
  has: (id: string) => boolean;
}

/** Netease playlists the user pinned for quick access (persisted locally). */
export const useNeteaseCollections = create<NeteaseCollectionsState>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (item) => {
        const exists = get().items.some((c) => c.id === item.id);
        set({
          items: exists
            ? get().items.filter((c) => c.id !== item.id)
            : [{ ...item, addedAt: Date.now() }, ...get().items].slice(0, 50),
        });
      },
      remove: (id) => set({ items: get().items.filter((c) => c.id !== id) }),
      has: (id) => get().items.some((c) => c.id === id),
    }),
    { name: 'aurora.netease.collections' },
  ),
);
