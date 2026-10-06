import { describe, expect, it, vi } from 'vitest';
import { embeddingScoreMap, rankWithEmbedding } from './embeddingClient';
import type { MusicTrack } from '@/music/source/types';

const track: MusicTrack = { id: '1', name: 'Song', artist: ['Artist'], album: 'Album', pic_id: '', url_id: '', lyric_id: '', source: 'mock' };

describe('embedding client', () => {
  it('uses the optional rerank endpoint and indexes scores', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: 'clap', scores: [{ id: '1', source: 'mock', score: 0.92, reason: 'dark' }] }), { status: 200 })));
    const result = await rankWithEmbedding('dark ambient', [track]);
    expect(embeddingScoreMap(result).get('mock:1')?.score).toBe(0.92);
    vi.unstubAllGlobals();
  });
});
