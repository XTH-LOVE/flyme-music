import { describe, expect, it } from 'vitest';
import { analyzePcm } from './features';
import { cosineSimilarity, describeSimilarity, rankSimilar } from './similarity';
import type { AudioFeatures } from './types';

const SR = 22050;

/** Build a short clip with controllable brightness and tempo. */
function clip(opts: { bpm: number; toneHz: number; seconds?: number }): Float32Array {
  const seconds = opts.seconds ?? 10;
  const out = new Float32Array(SR * seconds);
  const interval = (60 / opts.bpm) * SR;
  let seed = 42;
  for (let beat = 0; beat * interval < out.length; beat += 1) {
    const start = Math.round(beat * interval);
    for (let i = 0; i < SR * 0.02 && start + i < out.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      out[start + i] += ((seed / 0x7fffffff) * 2 - 1) * 0.3;
    }
  }
  for (let i = 0; i < out.length; i += 1) {
    out[i] += 0.35 * Math.sin((2 * Math.PI * opts.toneHz * i) / SR);
  }
  return out;
}

const dark = analyzePcm(clip({ bpm: 100, toneHz: 180 }), SR);
const darkAgain = analyzePcm(clip({ bpm: 100, toneHz: 180 }), SR);
const bright = analyzePcm(clip({ bpm: 160, toneHz: 3200 }), SR);

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('handles zero vectors without NaN', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('tolerates different lengths by comparing the shared prefix', () => {
    expect(cosineSimilarity([1, 1], [1, 1, 9, 9])).toBeCloseTo(1, 6);
  });
});

describe('similarity over real feature vectors', () => {
  it('scores identical clips higher than contrasting ones', () => {
    const same = cosineSimilarity(dark.vector, darkAgain.vector);
    const different = cosineSimilarity(dark.vector, bright.vector);
    expect(same).toBeGreaterThan(different);
  });

  it('ranks the matching clip first', () => {
    const ranked = rankSimilar(
      dark,
      [
        { item: 'bright', features: bright },
        { item: 'dark-again', features: darkAgain },
      ],
      2,
      0,
    );
    expect(ranked[0].item).toBe('dark-again');
  });

  it('drops candidates below the floor rather than calling them similar', () => {
    // A threshold above any achievable score must yield nothing, not a weak match.
    const ranked = rankSimilar(dark, [{ item: 'bright', features: bright }], 5, 0.999);
    expect(ranked).toEqual([]);
  });

  it('describes only the axes that actually agree', () => {
    const reason = rankSimilar(dark, [{ item: 'x', features: darkAgain }], 1, 0)[0].reason;
    const text = describeSimilarity(reason);
    // Identical clips agree on everything, so every axis should be named.
    expect(text).toContain('速度接近');
    expect(text).toContain('音色明暗接近');
  });

  it('does not claim agreement between contrasting clips', () => {
    const reason = rankSimilar(dark, [{ item: 'x', features: bright }], 1, 0)[0].reason;
    const text = describeSimilarity(reason);
    expect(text).not.toContain('速度接近');
  });
});

describe('feature vector sanity', () => {
  it('gives every analyzed track a finite, non-empty vector', () => {
    for (const f of [dark, bright] as AudioFeatures[]) {
      expect(f.vector.length).toBeGreaterThan(4);
      for (const v of f.vector) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
