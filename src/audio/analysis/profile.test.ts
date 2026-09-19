import { describe, expect, it } from 'vitest';
import { buildTasteProfile, MIN_PROFILE_TRACKS, renderTasteProfile } from './profile';
import { FEATURES_VERSION, type FeatureCard } from './types';

/** Minimal card with only the fields the profile reads. */
function card(overrides: Partial<FeatureCard> = {}): FeatureCard {
  return {
    version: FEATURES_VERSION,
    durationSec: 200,
    analysisRate: 22050,
    bpm: { value: 120, confidence: 0.8 },
    key: { tonic: 0, mode: 'major', confidence: 0.7 },
    dynamics: { peakDb: -8, meanDb: -18, rangeDb: 10, peakAtSec: 60 },
    timbre: { centroidHz: 2000, rolloffHz: 4000, flatness: 0.1, zeroCrossingRate: 0.05 },
    bands: { low: 0.3, mid: 0.5, high: 0.2 },
    energyCurve: [0.2, 0.5, 1],
    onsetDensity: 2,
    sections: [],
    vector: [1, 2, 3],
    trackKey: 'k',
    track: { id: '1', name: 'x', artist: ['a'], album: '', pic_id: 'p', url_id: 'u', lyric_id: 'l', source: 'mock' },
    name: 'x',
    artist: 'a',
    analyzedAt: 0,
    ...overrides,
  };
}

const many = (n: number, overrides: Partial<FeatureCard> = {}) =>
  Array.from({ length: n }, (_, i) => card({ trackKey: 'k' + i, ...overrides }));

describe('buildTasteProfile', () => {
  it('refuses to describe a taste from too small a sample', () => {
    // Stating a profile from two songs would be a guess dressed as a finding.
    expect(buildTasteProfile(many(MIN_PROFILE_TRACKS - 1))).toBeNull();
    expect(buildTasteProfile([])).toBeNull();
  });

  it('produces a profile once the sample is big enough', () => {
    const profile = buildTasteProfile(many(MIN_PROFILE_TRACKS));
    expect(profile).not.toBeNull();
    expect(profile?.trackCount).toBe(MIN_PROFILE_TRACKS);
  });

  it('averages tempo and reports a spread', () => {
    const profile = buildTasteProfile(many(6, { bpm: { value: 100, confidence: 0.8 } }));
    expect(profile?.bpm.mean).toBe(100);
    expect(profile?.bpm.low).toBeLessThanOrEqual(profile?.bpm.high ?? 0);
  });

  it('labels a dark library as 偏暗 and a bright one as 偏亮', () => {
    const dark = buildTasteProfile(
      many(6, { timbre: { centroidHz: 900, rolloffHz: 2000, flatness: 0.05, zeroCrossingRate: 0.02 } }),
    );
    expect(dark?.brightness.label).toBe('偏暗');
    const bright = buildTasteProfile(
      many(6, { timbre: { centroidHz: 5000, rolloffHz: 9000, flatness: 0.3, zeroCrossingRate: 0.2 } }),
    );
    expect(bright?.brightness.label).toBe('偏亮');
  });

  it('detects a minor-key bias', () => {
    const profile = buildTasteProfile(
      many(8, { key: { tonic: 9, mode: 'minor', confidence: 0.8 } }),
    );
    expect(profile?.keys.label).toBe('偏小调');
    expect(profile?.keys.minor).toBe(8);
  });

  it('calls a balanced split balanced', () => {
    const cards = [...many(4), ...many(4).map((c, i) => ({ ...c, trackKey: 'm' + i, key: { tonic: 9, mode: 'minor' as const, confidence: 0.8 } }))];
    expect(buildTasteProfile(cards)?.keys.label).toBe('均衡');
  });

  it('describes dynamics and rhythm from the means', () => {
    const flat = buildTasteProfile(many(6, { dynamics: { peakDb: -6, meanDb: -16, rangeDb: 3, peakAtSec: 10 } }));
    expect(flat?.dynamics.label).toBe('平稳');
    const wide = buildTasteProfile(many(6, { dynamics: { peakDb: -3, meanDb: -25, rangeDb: 22, peakAtSec: 10 } }));
    expect(wide?.dynamics.label).toBe('起伏很大');
    const busy = buildTasteProfile(many(6, { onsetDensity: 5 }));
    expect(busy?.rhythm.label).toBe('密集');
  });
});

describe('renderTasteProfile', () => {
  it('states the sample size so the model cannot overclaim', () => {
    const profile = buildTasteProfile(many(7))!;
    const text = renderTasteProfile(profile);
    expect(text).toContain('7 首');
    expect(text).toContain('样本有限');
  });

  it('includes every measured dimension', () => {
    const text = renderTasteProfile(buildTasteProfile(many(6))!);
    for (const label of ['速度', '明暗', '频段', '动态', '节奏', '调性']) {
      expect(text).toContain(label);
    }
  });
});
