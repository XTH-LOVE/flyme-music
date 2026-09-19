import type { MusicTrack } from '@/music/source/types';

/**
 * Structured, *measured* description of a track.
 *
 * Every numeric field carries a confidence or is a direct measurement. Nothing
 * here is inferred from metadata, and nothing is guessed: the whole point is
 * that a model can quote these facts instead of inventing an arrangement it has
 * never heard.
 */
export interface AudioFeatures {
  version: number;
  durationSec: number;
  /** Internal analysis rate after decimation. */
  analysisRate: number;

  bpm: { value: number; confidence: number };
  key: { tonic: number; mode: 'major' | 'minor'; confidence: number };

  dynamics: {
    peakDb: number;
    meanDb: number;
    /** peak - mean, i.e. how much the track moves. */
    rangeDb: number;
    /** Where the loudest moment is, in seconds. */
    peakAtSec: number;
  };

  timbre: {
    /** Brightness. Low = dark/warm, high = bright/aggressive. */
    centroidHz: number;
    rolloffHz: number;
    /** Near 1 = noise-like/percussive, near 0 = tonal. */
    flatness: number;
    zeroCrossingRate: number;
  };

  /** Energy share per band, sums to ~1. */
  bands: { low: number; mid: number; high: number };

  /** Normalised loudness per second (0..1), for describing how it builds. */
  energyCurve: number[];
  /** Onsets per second - rhythmic busyness. */
  onsetDensity: number;

  /**
   * Section boundaries found by novelty, with measurements only.
   *
   * Deliberately unlabelled apart from `likelyChorus`: calling a section a
   * "verse" is an interpretation, and a wrong label stated as fact is exactly
   * the failure mode this whole feature exists to remove. `likelyChorus` is
   * offered because it has a real basis - choruses repeat and are loud - and it
   * is reported with its own confidence.
   */
  sections: Array<{
    startSec: number;
    endSec: number;
    meanDb: number;
    isLoudest: boolean;
    likelyChorus: boolean;
  }>;

  /** Compact vector for similarity search. */
  vector: number[];
}

export const FEATURES_VERSION = 1;

export interface FeatureCard extends AudioFeatures {
  trackKey: string;
  name: string;
  artist: string;
  analyzedAt: number;
}

/** Stable identity for caching: same song from another source should hit. */
export function trackKeyOf(track: Pick<MusicTrack, 'source' | 'id' | 'name' | 'artist'>): string {
  return [track.source, track.id, track.name, track.artist.join('/')].join('|');
}
