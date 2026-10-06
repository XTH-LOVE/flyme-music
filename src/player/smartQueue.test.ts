import { describe, expect, it } from 'vitest';
import { suggestNextTracks } from './smartQueue';
import type { MusicTrack } from '@/music/source/types';
import type { AudioFeatures } from '@/audio/analysis/types';

const track = (id: string, artist = 'A', album = 'X'): MusicTrack => ({
  id, name: id, artist: [artist], album, pic_id: id, url_id: id, lyric_id: id, source: 'netease',
});

const features = (vector: number[]): AudioFeatures => ({
  version: 2,
  durationSec: 180,
  analysisRate: 22050,
  bpm: { value: 120, confidence: 1 },
  key: { tonic: 0, mode: 'major', confidence: 1 },
  dynamics: { peakDb: -1, meanDb: -12, rangeDb: 11, peakAtSec: 20 },
  timbre: { centroidHz: 1200, rolloffHz: 2400, flatness: 0.2, zeroCrossingRate: 0.1 },
  bands: { low: 0.3, mid: 0.4, high: 0.3 },
  energyCurve: [0.5],
  onsetDensity: 1,
  sections: [],
  vector,
});

describe('smart queue suggestions', () => {
  it('deduplicates and keeps the current track out', () => {
    const current = track('current');
    const result = suggestNextTracks(current, [
      { track: current },
      { track: track('next') },
      { track: track('next') },
    ]);
    expect(result.map((item) => item.track.id)).toEqual(['next']);
  });

  it('prefers continuity and liked tracks while penalising recent repeats', () => {
    const current = track('current', 'A', 'X');
    const result = suggestNextTracks(current, [
      { track: track('same-artist', 'A', 'Y') },
      { track: track('liked', 'B', 'Z'), liked: true },
      { track: track('recent', 'A', 'X'), liked: true, lastPlayedAt: 950 },
    ], { now: 1000, recentWindowMs: 10_000 });
    expect(result[0].track.id).toBe('liked');
    expect(result.findIndex((item) => item.track.id === 'recent')).toBeGreaterThan(0);
    expect(result.find((item) => item.track.id === 'recent')?.score).toBeLessThanOrEqual(
      result.find((item) => item.track.id === 'liked')?.score ?? 0,
    );
  });

  it('uses cached audio similarity as the strongest signal when available', () => {
    const current = track('current', 'A');
    const result = suggestNextTracks(current, [
      { track: track('similar', 'B'), features: features([1, 0]) },
      { track: track('different', 'A'), features: features([0, 1]), liked: true },
    ], {
      currentFeatures: features([1, 0]),
      limit: 2,
    });
    expect(result[0].track.id).toBe('similar');
    expect(result[0].reasons).toContain('听感相似');
  });
});
