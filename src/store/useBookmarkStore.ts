import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Bookmarks: a moment in a song, kept.
 *
 * For the places worth returning to - a line that lands, a solo, the point in
 * a long mix where the part you like begins, a spot in a language lesson. A
 * player can already seek, but only if you know the number, and nobody knows
 * the number.
 *
 * Keyed by track, not global, because a timestamp without its song is
 * meaningless. The note is optional: most of the time the position is the whole
 * message, and demanding a description would stop people from marking anything.
 */

export interface Bookmark {
  id: string;
  /** Track key, in the same form the player uses. */
  trackKey: string;
  /** Seconds into the track. */
  time: number;
  /** Optional, and often empty. */
  note: string;
  createdAt: number;
}

interface BookmarkState {
  bookmarks: Bookmark[];
  add: (trackKey: string, time: number, note: string) => void;
  remove: (id: string) => void;
  /** Newest first within a track; the caller sorts by time when it wants that. */
  forTrack: (trackKey: string) => Bookmark[];
}

/** Enough for any realistic use, small enough that storage never notices. */
const MAX_BOOKMARKS = 300;

function newId(): string {
  // Time plus randomness: two bookmarks made in the same millisecond on the
  // same track still get distinct ids, which a counter alone would not.
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const useBookmarkStore = create<BookmarkState>()(
  persist(
    (set, get) => ({
      bookmarks: [],

      add: (trackKey, time, note) => {
        const next: Bookmark[] = [
          { id: newId(), trackKey, time: Math.max(0, time), note: note.trim(), createdAt: Date.now() },
          ...get().bookmarks,
        ].slice(0, MAX_BOOKMARKS);
        set({ bookmarks: next });
      },

      remove: (id) => {
        set({ bookmarks: get().bookmarks.filter((b) => b.id !== id) });
      },

      forTrack: (trackKey) => get().bookmarks.filter((b) => b.trackKey === trackKey),
    }),
    { name: 'aurora.bookmarks' },
  ),
);
