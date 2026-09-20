import { describe, expect, it } from 'vitest';
import { planGuestSync } from './sync';

const NOW = Date.parse('2026-09-04T12:00:00Z');

describe('planGuestSync', () => {
  it('switches tracks and lands on the host position plus elapsed time', () => {
    const cmd = planGuestSync(
      { trackKey: 'netease:1', position: 5, isPlaying: true },
      { trackKey: 'netease:2', queueIndex: 3, positionSeconds: 30, isPlaying: true, updatedAt: NOW - 2000 },
      NOW,
    );
    expect(cmd).toEqual({ kind: 'switch', queueIndex: 3, seekTo: 32 });
  });

  it('does not advance the clock while the host is paused', () => {
    const cmd = planGuestSync(
      { trackKey: 'netease:1', position: 5, isPlaying: true },
      { trackKey: 'netease:1', queueIndex: 0, positionSeconds: 42, isPlaying: false, updatedAt: NOW - 9000 },
      NOW,
    );
    expect(cmd).toEqual({ kind: 'seek', seekTo: 42 });
  });

  it('toggles playback when only the play state differs (within drift)', () => {
    const cmd = planGuestSync(
      { trackKey: 'netease:1', position: 30, isPlaying: false },
      { trackKey: 'netease:1', queueIndex: 0, positionSeconds: 30, isPlaying: true, updatedAt: NOW },
      NOW,
    );
    expect(cmd).toEqual({ kind: 'toggle' });
  });

  it('re-seeks on drift beyond tolerance and stays quiet otherwise', () => {
    const drift = planGuestSync(
      { trackKey: 'netease:1', position: 10, isPlaying: true },
      { trackKey: 'netease:1', queueIndex: 0, positionSeconds: 60, isPlaying: true, updatedAt: NOW },
      NOW,
    );
    expect(drift).toEqual({ kind: 'seek', seekTo: 60 });

    const inSync = planGuestSync(
      { trackKey: 'netease:1', position: 60.5, isPlaying: true },
      { trackKey: 'netease:1', queueIndex: 0, positionSeconds: 60, isPlaying: true, updatedAt: NOW - 400 },
      NOW,
    );
    expect(inSync).toEqual({ kind: 'none' });
  });

  it('treats an empty host room as a track switch away from local playback', () => {
    const cmd = planGuestSync(
      { trackKey: 'netease:1', position: 5, isPlaying: true },
      { trackKey: null, queueIndex: 0, positionSeconds: 0, isPlaying: false, updatedAt: NOW },
      NOW,
    );
    expect(cmd).toEqual({ kind: 'switch', queueIndex: 0, seekTo: 0 });
  });
});
