import { create } from 'zustand';
import { playerController } from '@/player';
import type { PlayerSnapshot } from '@/player';

interface PlayerUIState extends PlayerSnapshot {
  /** Full player overlay visibility (state-driven for shared-element feel). */
  fullPlayerOpen: boolean;
  lyricsMode: boolean;
  openFullPlayer: () => void;
  closeFullPlayer: () => void;
  toggleLyricsMode: () => void;
}

export const usePlayerStore = create<PlayerUIState>((set) => ({
  ...playerController.snapshot(),
  fullPlayerOpen: false,
  lyricsMode: false,
  openFullPlayer: () => set({ fullPlayerOpen: true }),
  closeFullPlayer: () => set({ fullPlayerOpen: false }),
  toggleLyricsMode: () => set((s) => ({ lyricsMode: !s.lyricsMode })),
}));

// Mirror engine snapshots into the store - single source of truth stays in the controller.
playerController.subscribe((snapshot) => {
  usePlayerStore.setState(snapshot);
});
