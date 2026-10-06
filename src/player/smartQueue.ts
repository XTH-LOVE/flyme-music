import type { MusicTrack } from '@/music/source/types';
import { cosineSimilarity } from '@/audio/analysis/similarity';
import type { AudioFeatures } from '@/audio/analysis/types';

export interface SmartQueueCandidate {
  track: MusicTrack;
  features?: AudioFeatures;
  liked?: boolean;
  playCount?: number;
  lastPlayedAt?: number;
}

export interface SmartQueueOptions {
  limit?: number;
  now?: number;
  recentWindowMs?: number;
  currentFeatures?: AudioFeatures;
}

export interface SmartQueueSuggestion {
  track: MusicTrack;
  score: number;
  reasons: string[];
}

const keyOf = (track: MusicTrack): string => `${track.source}:${track.id}`;

/**
 * Rank candidates for "play next" without mutating the user's queue.
 * Metadata is only a tie-breaker; measured audio similarity wins when present.
 */
export function suggestNextTracks(
  current: MusicTrack,
  candidates: readonly SmartQueueCandidate[],
  options: SmartQueueOptions = {},
): SmartQueueSuggestion[] {
  const now = options.now ?? Date.now();
  const recentWindowMs = options.recentWindowMs ?? 24 * 60 * 60 * 1000;
  const limit = Math.max(1, options.limit ?? 5);
  const currentKey = keyOf(current);
  const seen = new Set<string>();

  return candidates
    .filter(({ track }) => {
      const key = keyOf(track);
      if (key === currentKey || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((candidate) => {
      const { track, features } = candidate;
      let score = 0;
      const reasons: string[] = [];
      if (features && options.currentFeatures) {
        // Audio vectors are the strongest signal, but leave room for taste and
        // continuity so a perfect sound match is not always the same artist.
        score += cosineSimilarity(options.currentFeatures.vector, features.vector) * 0.55;
        reasons.push('听感相似');
      }
      if (candidate.liked) {
        score += 0.24;
        reasons.push('喜欢的歌曲');
      }
      if (candidate.playCount) {
        score += Math.min(0.12, Math.log1p(candidate.playCount) * 0.04);
      }
      if (candidate.lastPlayedAt && now - candidate.lastPlayedAt < recentWindowMs) {
        score -= 0.2;
        reasons.push('最近听过，降低重复');
      }
      if (track.artist.some((artist) => current.artist.includes(artist))) {
        score += 0.12;
        reasons.push('歌手连续性');
      }
      if (track.album && track.album === current.album) {
        score += 0.08;
        reasons.push('同专辑');
      }
      return { track, score, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
