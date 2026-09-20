import { describe, expect, it } from 'vitest';
import { flingVelocity, trimSamples, VELOCITY_WINDOW_MS } from './dismissGesture';

describe('flingVelocity', () => {
  it('returns zero when there is nothing to measure', () => {
    expect(flingVelocity([])).toBe(0);
    expect(flingVelocity([{ t: 0, y: 0 }])).toBe(0);
  });

  it('returns zero for a zero-length window rather than NaN', () => {
    // Two samples stamped identically would divide by zero; the caller compares
    // the result against a threshold, and NaN would fail every comparison.
    expect(flingVelocity([{ t: 5, y: 0 }, { t: 5, y: 40 }])).toBe(0);
  });

  it('measures a downward flick in px per second', () => {
    // 60px in 100ms = 600px/s.
    expect(flingVelocity([{ t: 0, y: 0 }, { t: 100, y: 60 }])).toBe(600);
  });

  it('reports an upward drag as negative', () => {
    expect(flingVelocity([{ t: 0, y: 60 }, { t: 100, y: 0 }])).toBe(-600);
  });

  it('uses only the first and last sample of the window', () => {
    // The middle sample must not shift the measurement.
    expect(flingVelocity([{ t: 0, y: 0 }, { t: 50, y: 3 }, { t: 100, y: 100 }])).toBe(1000);
  });
});

describe('trimSamples', () => {
  it('keeps samples inside the trailing window', () => {
    const samples = [
      { t: 0, y: 0 },
      { t: 200, y: 10 },
      { t: 260, y: 20 },
    ];
    expect(trimSamples(samples, 260)).toEqual([
      { t: 200, y: 10 },
      { t: 260, y: 20 },
    ]);
  });

  it('always keeps one sample as the next baseline', () => {
    const samples = [{ t: 0, y: 0 }];
    expect(trimSamples(samples, 10_000)).toEqual([{ t: 0, y: 0 }]);
  });

  it('keeps a sample exactly on the window edge', () => {
    const samples = [{ t: 0, y: 0 }, { t: 300, y: 30 }];
    expect(trimSamples(samples, VELOCITY_WINDOW_MS)).toEqual([
      { t: 0, y: 0 },
      { t: 300, y: 30 },
    ]);
  });
});
