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
export const useExtrasStore = create<ExtrasState>((set) => ({
  speed: 1,
  setSpeed: (v) => {
    playerController.setSpeed(v);
    set({ speed: v });
  },
  sleepEndsAt: null,
  stopAfterCurrent: false,
  setSleepMinutes: (minutes) => {
    set(
      minutes === null
        ? { sleepEndsAt: null, stopAfterCurrent: false }
        : { sleepEndsAt: Date.now() + minutes * 60_000, stopAfterCurrent: false },
    );
  },
  setStopAfterCurrent: (v) => set({ stopAfterCurrent: v, sleepEndsAt: null }),
  clearSleep: () => set({ sleepEndsAt: null, stopAfterCurrent: false }),
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
