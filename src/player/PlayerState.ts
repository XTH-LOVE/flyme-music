import type { MusicTrack } from '@/music/source/types';

export type RepeatMode = 'off' | 'all' | 'one';

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

/** Immutable snapshot pushed to every subscriber. */
export interface PlayerSnapshot {
  current: MusicTrack | null;
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  volume: number;
  /**
   * A-B repeat marks in seconds, or null when unset.
   *
   * Exposed so the control can show which of the three states it is in - off,
   * waiting for the end mark, or looping - without keeping a copy of the
   * player's own state.
   */
  loopA: number | null;
  loopB: number | null;
  /** Engine playback rate (0.5-3x); needed so the OS can interpolate position. */
  speed: number;
  queue: MusicTrack[];
  queueIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** True while progress is driven by the simulated clock (stream not ready). */
  simulated: boolean;
}

export type PlayerListener = (snapshot: PlayerSnapshot) => void;
