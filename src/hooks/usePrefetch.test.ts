import { describe, expect, it } from 'vitest';
import { AUDIO_PREFETCH_LEAD_SECONDS, shouldPrefetchNext } from './usePrefetch';

/**
 * The prefetch only pays off if it wins the race against the transition, and it
 * only stays acceptable if it does not fire early enough to spend data on tracks
 * the user skips. Both halves of that trade are the boundary tested here.
 */
describe('shouldPrefetchNext', () => {
  const playing = { status: 'playing' as const, duration: 200, currentTime: 100, hasNext: true };

  it('stays quiet until the current track is nearly over', () => {
    expect(shouldPrefetchNext({ ...playing, currentTime: 0 })).toBe(false);
    expect(shouldPrefetchNext({ ...playing, currentTime: 100 })).toBe(false);
  });

  it('starts exactly at the lead time, not a tick later', () => {
    expect(shouldPrefetchNext({ ...playing, currentTime: 200 - AUDIO_PREFETCH_LEAD_SECONDS })).toBe(true);
    expect(shouldPrefetchNext({ ...playing, currentTime: 200 - AUDIO_PREFETCH_LEAD_SECONDS - 0.1 })).toBe(false);
  });

  it('keeps warming through the final seconds', () => {
    expect(shouldPrefetchNext({ ...playing, currentTime: 199.5 })).toBe(true);
  });

  it('does nothing when there is no next track', () => {
    expect(shouldPrefetchNext({ ...playing, currentTime: 199, hasNext: false })).toBe(false);
  });

  it('does nothing while paused or idle', () => {
    expect(shouldPrefetchNext({ ...playing, currentTime: 199, status: 'paused' })).toBe(false);
    expect(shouldPrefetchNext({ ...playing, currentTime: 199, status: 'idle' })).toBe(false);
  });

  it('does nothing without a known duration', () => {
    // Duration is 0 until metadata arrives; a bogus "remaining" must not read
    // as "about to end" and trigger a download for every unknown track.
    expect(shouldPrefetchNext({ ...playing, duration: 0, currentTime: 0 })).toBe(false);
  });

  it('does nothing once the track has already run past its end', () => {
    expect(shouldPrefetchNext({ ...playing, currentTime: 200 })).toBe(false);
    expect(shouldPrefetchNext({ ...playing, currentTime: 260 })).toBe(false);
  });
});
