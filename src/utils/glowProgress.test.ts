import { describe, expect, it } from 'vitest';
import {
  GLOW_MIN_SIZE,
  glowFillWidth,
  glowHeadOpacity,
} from './glowProgress';

/** Pulls the multiplier back out of the generated `calc()` expression. */
const multiplierOf = (css: string): number => {
  const match = /\* ([0-9.]+)\)$/.exec(css);
  return match ? Number(match[1]) : Number.NaN;
};

describe('glowFillWidth', () => {
  it('starts at the minimum size, not at zero', () => {
    expect(glowFillWidth(0)).toContain('(100% - 6px) * 0.0000');
    expect(multiplierOf(glowFillWidth(0))).toBe(0);
  });

  it('reaches the full track at the end', () => {
    expect(multiplierOf(glowFillWidth(1))).toBe(1);
  });

  it('passes the progress through in the middle', () => {
    expect(multiplierOf(glowFillWidth(0.42))).toBeCloseTo(0.42, 4);
  });

  it('interpolates between the minimum and the track, not from zero', () => {
    // mix(6, W, p) = 6 + (W - 6) * p. At p = 1 that is exactly W, which is what
    // makes the bar land on the end of the track rather than 6px short of it.
    const css = glowFillWidth(1);
    expect(css).toBe('calc(6px + (100% - 6px) * 1.0000)');
  });

  it('clamps progress from both ends', () => {
    expect(multiplierOf(glowFillWidth(-3))).toBe(0);
    expect(multiplierOf(glowFillWidth(4))).toBe(1);
  });

  it('survives NaN, which a zero-length track would produce', () => {
    expect(multiplierOf(glowFillWidth(Number.NaN))).toBe(0);
    expect(multiplierOf(glowFillWidth(Number.POSITIVE_INFINITY))).toBe(0);
  });

  it('honours a custom minimum size', () => {
    expect(glowFillWidth(0, 10)).toContain('(100% - 10px)');
    expect(GLOW_MIN_SIZE).toBe(6);
  });
});

describe('glowHeadOpacity', () => {
  it('is invisible at the very start, where the sprite would hang off the bar', () => {
    expect(glowHeadOpacity(0)).toBe(0);
  });

  it('is fully visible once past the fade', () => {
    expect(glowHeadOpacity(0.04)).toBe(1);
    expect(glowHeadOpacity(0.5)).toBe(1);
    expect(glowHeadOpacity(1)).toBe(1);
  });

  it('ramps linearly through the fade', () => {
    expect(glowHeadOpacity(0.02)).toBeCloseTo(0.5, 6);
    expect(glowHeadOpacity(0.01)).toBeCloseTo(0.25, 6);
  });

  it('never exceeds 1 or drops below 0', () => {
    for (const p of [-1, 0, 0.001, 0.5, 1, 2, Number.NaN]) {
      const value = glowHeadOpacity(p);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('treats a zero fade as "never fade" instead of dividing by it', () => {
    expect(glowHeadOpacity(0, 0)).toBe(1);
    expect(glowHeadOpacity(0.5, 0)).toBe(1);
  });

  it('honours a custom fade length', () => {
    expect(glowHeadOpacity(0.1, 0.2)).toBeCloseTo(0.5, 6);
  });
});
