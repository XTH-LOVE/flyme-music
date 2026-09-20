import { describe, expect, it } from 'vitest';
import { initialOf, playlistArt } from './playlistArt';

describe('playlistArt', () => {
  it('is deterministic for the same seed', () => {
    const a = playlistArt('雨天歌单', 'pl-1');
    const b = playlistArt('雨天歌单', 'pl-1');
    expect(a).toEqual(b);
  });

  it('varies by seed and stays within its ranges', () => {
    const specs = Array.from({ length: 24 }, (_, i) => playlistArt('歌单', 'pl-' + i));
    const palettes = new Set(specs.map((s) => s.gradient.join()));
    const patterns = new Set(specs.map((s) => s.pattern));
    expect(palettes.size).toBeGreaterThan(1);
    expect(patterns.size).toBeGreaterThan(1);
    for (const s of specs) {
      expect(s.pattern).toBeGreaterThanOrEqual(0);
      expect(s.pattern).toBeLessThanOrEqual(3);
    }
  });

  it('falls back to a note glyph for empty names', () => {
    expect(playlistArt('', 'pl-9').initial).toBe('♪');
    expect(playlistArt('  ', 'pl-9').initial).toBe('♪');
  });
});

describe('initialOf', () => {
  it('takes the first meaningful character, uppercased', () => {
    expect(initialOf('雨天歌单')).toBe('雨');
    expect(initialOf('late night mixes')).toBe('L');
    expect(initialOf('【收藏】粤语精選')).toBe('粤');
  });
});
