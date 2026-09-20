import { describe, expect, it } from 'vitest';
import { bitrateForQuality } from './quality';

/**
 * The resolved stream URL is cached per bitrate, so this mapping is the shared
 * contract between whoever warms the cache and whoever reads it - the player,
 * the download path and the next-track prefetch. Drifting here would not fail a
 * build; it would quietly warm an entry nothing reads, or miss the one playback
 * is about to ask for.
 */
describe('bitrateForQuality', () => {
  it('maps every quality setting to its bitrate', () => {
    expect(bitrateForQuality('standard')).toBe(192);
    expect(bitrateForQuality('high')).toBe(320);
    expect(bitrateForQuality('lossless')).toBe(999);
  });

  it('is total over the settings the app exposes', () => {
    for (const quality of ['standard', 'high', 'lossless'] as const) {
      expect(Number.isFinite(bitrateForQuality(quality))).toBe(true);
      expect(bitrateForQuality(quality)).toBeGreaterThan(0);
    }
  });
});
