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
  queue: MusicTrack[];
  queueIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** True while progress is driven by the simulated clock (stream not ready). */
  simulated: boolean;
}

export type PlayerListener = (snapshot: PlayerSnapshot) => void;
