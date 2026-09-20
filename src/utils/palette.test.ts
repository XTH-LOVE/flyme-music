import { describe, expect, it } from 'vitest';
import { accentFromCover, fallbackPalette } from './palette';

describe('fallbackPalette', () => {
  it('is deterministic and always returns a real two-tone palette', () => {
    const a = fallbackPalette('netease:12345');
    expect(a).toEqual(fallbackPalette('netease:12345'));
    expect(a).toHaveLength(2);
    expect(a[0]).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('spreads different ids across the palette list', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) seen.add(fallbackPalette('id-' + i)[0]);
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('accentFromCover', () => {
  const cover: [string, string] = ['#e8622c', '#ffc48a'];

  it('uses the cover colour when dynamic accent is on', () => {
    expect(accentFromCover(cover, true)).toBe('#e8622c');
  });

  it('leaves the accent alone when dynamic accent is off', () => {
    expect(accentFromCover(cover, false)).toBeNull();
  });

  it('never falls back to a placeholder while the cover is still loading', () => {
    // The regression this guards: substituting `fallbackPalette` here repainted
    // the whole app in a hash-derived colour for a frame on every track change.
    expect(accentFromCover(null, true)).toBeNull();
  });

  it('leaves the accent alone for a cover whose colours cannot be extracted', () => {
    // Same answer as "still loading", which is what makes a failed extraction
    // settle on the theme accent instead of flickering.
    expect(accentFromCover(null, false)).toBeNull();
  });
});
