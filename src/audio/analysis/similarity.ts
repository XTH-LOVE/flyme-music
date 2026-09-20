import type { AudioFeatures } from './types';

/**
 * Cosine similarity over the feature vectors.
 *
 * This is what makes "similar" mean *sounds alike* rather than "the search
 * engine returned it for the same artist name". Vectors are short and
 * hand-built, so the distance is cheap and inspectable - the caller can say
 * which axes matched.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den > 0 ? dot / den : 0;
}

/** Human-readable reasons two tracks are close, for the model to quote. */
export interface SimilarityReason {
  bpmDelta: number;
  brightnessDeltaHz: number;
  bandDelta: { low: number; mid: number; high: number };
  densityDelta: number;
  rangeDeltaDb: number;
}

export function compareFeatures(a: AudioFeatures, b: AudioFeatures): SimilarityReason {
  return {
    bpmDelta: Math.abs(a.bpm.value - b.bpm.value),
    brightnessDeltaHz: Math.abs(a.timbre.centroidHz - b.timbre.centroidHz),
    bandDelta: {
      low: Math.abs(a.bands.low - b.bands.low),
      mid: Math.abs(a.bands.mid - b.bands.mid),
      high: Math.abs(a.bands.high - b.bands.high),
    },
    densityDelta: Math.abs(a.onsetDensity - b.onsetDensity),
    rangeDeltaDb: Math.abs(a.dynamics.rangeDb - b.dynamics.rangeDb),
  };
}

/**
 * Phrase the match in terms of the axes that actually agree.
 *
 * Only mentions axes that are genuinely close, so the sentence is a description
 * of the measurement rather than a compliment.
 */
export function describeSimilarity(reason: SimilarityReason): string {
  const parts: string[] = [];
  if (reason.bpmDelta <= 6) parts.push('速度接近');
  if (reason.brightnessDeltaHz <= 400) parts.push('音色明暗接近');
  if (reason.bandDelta.low <= 0.08 && reason.bandDelta.high <= 0.08) parts.push('频段分布接近');
  if (reason.densityDelta <= 0.8) parts.push('节奏密度接近');
  if (reason.rangeDeltaDb <= 3) parts.push('动态起伏接近');
  return parts.length ? parts.join('、') : '整体听感接近';
}

export interface RankedCandidate<T> {
  item: T;
  score: number;
  reason: SimilarityReason;
}

/**
 * Rank candidates against a target, best first.
 *
 * `minScore` keeps obviously unrelated tracks out: a weak match presented as
 * "similar" is worse than admitting nothing close was found.
 */
export function rankSimilar<T>(
  target: AudioFeatures,
  candidates: Array<{ item: T; features: AudioFeatures }>,
  limit = 10,
  minScore = 0.9,
): Array<RankedCandidate<T>> {
  return candidates
    .map(({ item, features }) => ({
      item,
      score: cosineSimilarity(target.vector, features.vector),
      reason: compareFeatures(target, features),
    }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
