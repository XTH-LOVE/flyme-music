import type { MusicSource } from '@/music/source/types';

export type PlaybackFailureReason = 'unavailable' | 'network' | 'copyright' | 'unknown';

export interface PlaybackFailure {
  source: MusicSource;
  reason: PlaybackFailureReason;
  message: string;
  at: number;
}

const failures = new Map<string, PlaybackFailure>();
const keyOf = (source: MusicSource, id: string) => source + ':' + id;

export function setPlaybackFailure(
  source: MusicSource,
  id: string,
  reason: PlaybackFailureReason = 'unavailable',
  message = '当前音源没有返回可播放地址',
): void {
  failures.set(keyOf(source, id), { source, reason, message, at: Date.now() });
}

export function getPlaybackFailure(source: MusicSource, id: string): PlaybackFailure | null {
  return failures.get(keyOf(source, id)) ?? null;
}

export function clearPlaybackFailure(source: MusicSource, id: string): void {
  failures.delete(keyOf(source, id));
}
