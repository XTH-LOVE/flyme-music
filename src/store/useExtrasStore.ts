import { create } from 'zustand';
import { playerController } from '@/player';

interface ExtrasState {
  /** Playback speed (1 = normal). Mirrored into the engine on set. */
  speed: number;
  setSpeed: (v: number) => void;
  /** Sleep timer end timestamp (ms) or null. */
  sleepEndsAt: number | null;
  /** Pause right after the current song ends (Halcyon "stop after current"). */
  stopAfterCurrent: boolean;
  /** Volume the player had when the sleep timer was armed (for fade restore). */
  sleepFromVolume: number | null;
  setSleepMinutes: (minutes: number | null) => void;
  setStopAfterCurrent: (v: boolean) => void;
  clearSleep: () => void;
  /** Halcyon immersiveAlbumCover: full-bleed artwork player view. */
  immersive: boolean;
  toggleImmersive: () => void;
}

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

/** Small player extras: speed, sleep timer and immersive mode. */
export const useExtrasStore = create<ExtrasState>((set, get) => ({
  speed: 1,
  setSpeed: (v) => {
    playerController.setSpeed(v);
    set({ speed: v });
  },
  sleepEndsAt: null,
  stopAfterCurrent: false,
  sleepFromVolume: null,
  setSleepMinutes: (minutes) => {
    if (minutes === null) {
      // Restore the pre-fade volume before clearing, then drop the fade state.
      const from = get().sleepFromVolume;
      if (typeof from === 'number') playerController.setVolume(from);
      set({ sleepEndsAt: null, stopAfterCurrent: false, sleepFromVolume: null });
      return;
    }
    set({
      sleepEndsAt: Date.now() + minutes * 60_000,
      stopAfterCurrent: false,
      sleepFromVolume: playerController.snapshot().volume,
    });
  },
  setStopAfterCurrent: (v) => {
    const from = get().sleepFromVolume;
    if (v === false && typeof from === 'number') playerController.setVolume(from);
    set({
      stopAfterCurrent: v,
      sleepEndsAt: null,
      sleepFromVolume: v ? playerController.snapshot().volume : null,
    });
  },
  clearSleep: () => {
    const from = get().sleepFromVolume;
    if (typeof from === 'number') playerController.setVolume(from);
    set({ sleepEndsAt: null, stopAfterCurrent: false, sleepFromVolume: null });
  },
  immersive: loadBool('aurora.immersive', false),
  toggleImmersive: () =>
    set((s) => {
      try {
        localStorage.setItem('aurora.immersive', s.immersive ? '0' : '1');
      } catch {
        /* ignore */
      }
      return { immersive: !s.immersive };
    }),
}));
