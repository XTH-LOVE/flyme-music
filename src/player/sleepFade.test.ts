import { describe, expect, it } from 'vitest';
import { sleepFadeVolume, SLEEP_FADE_SECONDS } from './sleepFade';

const END = 1_000_000;

describe('sleepFadeVolume', () => {
  it('returns null before the fade window starts', () => {
    const before = END - (SLEEP_FADE_SECONDS + 5) * 1000;
    expect(sleepFadeVolume(before, END, 0.8)).toBeNull();
  });

  it('returns the full volume exactly at the fade start', () => {
    const start = END - SLEEP_FADE_SECONDS * 1000;
    expect(sleepFadeVolume(start, END, 0.8)).toBeCloseTo(0.8, 5);
  });

  it('returns 0 at (and after) the deadline', () => {
    expect(sleepFadeVolume(END, END, 0.8)).toBe(0);
    expect(sleepFadeVolume(END + 1000, END, 0.8)).toBe(0);
  });

  it('decreases monotonically through the window', () => {
    const start = END - SLEEP_FADE_SECONDS * 1000;
    const mid = END - (SLEEP_FADE_SECONDS / 2) * 1000;
    const late = END - 1000;
    const a = sleepFadeVolume(start, END, 1) ?? 0;
    const b = sleepFadeVolume(mid, END, 1) ?? 0;
    const c = sleepFadeVolume(late, END, 1) ?? 0;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBeGreaterThanOrEqual(0);
  });

  it('scales linearly with the starting volume', () => {
    const mid = END - (SLEEP_FADE_SECONDS / 2) * 1000;
    const hi = sleepFadeVolume(mid, END, 1) ?? 0;
    const lo = sleepFadeVolume(mid, END, 0.5) ?? 0;
    expect(lo).toBeCloseTo(hi * 0.5, 5);
  });
});
