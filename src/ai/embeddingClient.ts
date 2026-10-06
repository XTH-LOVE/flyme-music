import type { MusicTrack } from '@/music/source/types';

export interface EmbeddingRank {
  source: string;
  id: string;
  score: number;
  reason?: string;
}

export interface EmbeddingRankResponse {
  provider?: string;
  model?: string;
  scores?: EmbeddingRank[];
}

/**
 * Optional CLAP/EffNet-compatible reranker. The browser never receives the
 * provider key; `/api/music/rank` owns that credential and returns only scores.
 */
export async function rankWithEmbedding(query: string, tracks: MusicTrack[], signal?: AbortSignal): Promise<EmbeddingRankResponse | null> {
  if (!query.trim() || !tracks.length || typeof fetch === 'undefined') return null;
  try {
    const response = await fetch('/api/music/rank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query.trim(),
        candidates: tracks.map((track) => ({
          id: track.id,
          source: track.source,
          name: track.name,
          artist: track.artist,
          album: track.album,
        })),
      }),
      signal,
    });
    if (!response.ok) return null;
    const value = await response.json() as EmbeddingRankResponse;
    if (!Array.isArray(value.scores)) return null;
    return value;
  } catch {
    return null;
  }
}

export function embeddingScoreMap(response: EmbeddingRankResponse | null): Map<string, EmbeddingRank> {
  return new Map((response?.scores ?? []).filter((item) => item && typeof item.source === 'string' && typeof item.id === 'string').map((item) => [`${item.source}:${item.id}`, item]));
}
