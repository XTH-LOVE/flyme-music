import type { FeatureCard } from './types';

/**
 * What the user's library sounds like, aggregated from analysed tracks.
 *
 * Built from measurements only, so it can be stated as fact: "your tracks
 * average 118 BPM and sit on the bright side" is checkable, unlike a genre label
 * inferred from artist names.
 */
export interface TasteProfile {
  trackCount: number;
  bpm: { mean: number; low: number; high: number };
  brightness: { meanCentroidHz: number; label: '偏暗' | '中性' | '偏亮' };
  bands: { low: number; mid: number; high: number };
  dynamics: { meanRangeDb: number; label: '平稳' | '有起伏' | '起伏很大' };
  rhythm: { meanOnsetDensity: number; label: '疏朗' | '适中' | '密集' };
  keys: { major: number; minor: number; label: '偏大调' | '偏小调' | '均衡' };
}

/** Below this the sample is too small to describe a taste. */
export const MIN_PROFILE_TRACKS = 5;

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

export function buildTasteProfile(cards: FeatureCard[]): TasteProfile | null {
  if (cards.length < MIN_PROFILE_TRACKS) return null;

  const bpms = cards.map((c) => c.bpm.value).filter((v) => v > 0);
  const centroids = cards.map((c) => c.timbre.centroidHz);
  const ranges = cards.map((c) => c.dynamics.rangeDb);
  const densities = cards.map((c) => c.onsetDensity);
  const meanCentroid = mean(centroids);
  const meanRange = mean(ranges);
  const meanDensity = mean(densities);
  const majorCount = cards.filter((c) => c.key.mode === 'major').length;
  const minorCount = cards.length - majorCount;
  const majorShare = majorCount / cards.length;

  return {
    trackCount: cards.length,
    bpm: {
      mean: Math.round(mean(bpms)),
      low: Math.round(percentile(bpms, 0.2)),
      high: Math.round(percentile(bpms, 0.8)),
    },
    brightness: {
      meanCentroidHz: Math.round(meanCentroid),
      label: meanCentroid < 1400 ? '偏暗' : meanCentroid < 2600 ? '中性' : '偏亮',
    },
    bands: {
      low: Number(mean(cards.map((c) => c.bands.low)).toFixed(3)),
      mid: Number(mean(cards.map((c) => c.bands.mid)).toFixed(3)),
      high: Number(mean(cards.map((c) => c.bands.high)).toFixed(3)),
    },
    dynamics: {
      meanRangeDb: Number(meanRange.toFixed(1)),
      label: meanRange < 8 ? '平稳' : meanRange < 15 ? '有起伏' : '起伏很大',
    },
    rhythm: {
      meanOnsetDensity: Number(meanDensity.toFixed(2)),
      label: meanDensity < 1.5 ? '疏朗' : meanDensity < 3.5 ? '适中' : '密集',
    },
    keys: {
      major: majorCount,
      minor: minorCount,
      label: majorShare > 0.65 ? '偏大调' : majorShare < 0.35 ? '偏小调' : '均衡',
    },
  };
}

/** Render the profile for the model. States the sample size so it cannot overclaim. */
export function renderTasteProfile(profile: TasteProfile): string {
  return [
    `【本地听感画像】基于已分析过的 ${profile.trackCount} 首歌（样本有限，别当全量结论）：`,
    `· 速度：平均 ${profile.bpm.mean} BPM，主要区间 ${profile.bpm.low}–${profile.bpm.high} BPM`,
    `· 明暗：平均谱重心 ${profile.brightness.meanCentroidHz} Hz（${profile.brightness.label}）`,
    `· 频段：低频 ${(profile.bands.low * 100).toFixed(0)}% / 中频 ${(profile.bands.mid * 100).toFixed(0)}% / 高频 ${(profile.bands.high * 100).toFixed(0)}%`,
    `· 动态：平均动态范围 ${profile.dynamics.meanRangeDb} dB（${profile.dynamics.label}）`,
    `· 节奏：平均每秒 ${profile.rhythm.meanOnsetDensity} 个起音（${profile.rhythm.label}）`,
    `· 调性：大调 ${profile.keys.major} 首 / 小调 ${profile.keys.minor} 首（${profile.keys.label}）`,
    '',
    '用法：谈用户口味时以此为依据，但要说清这是"已分析样本"而非全部收藏。不要据此推断具体流派或年代。',
  ].join('\n');
}
