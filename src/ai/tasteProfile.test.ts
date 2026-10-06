import { describe, expect, it } from 'vitest';
import { buildAiTasteProfile, scoreTrackByTaste } from './tasteProfile';
import { logListeningEvent } from './listeningEvents';
import type { MusicTrack } from '@/music/source/types';

const track: MusicTrack = { id: '1', name: 'Song', artist: ['Artist'], album: 'Album', pic_id: '', url_id: '', lyric_id: '', source: 'mock' };

describe('AI taste profile', () => {
  it('turns completion and skip behavior into ranking signals', () => {
    localStorage.clear();
    logListeningEvent('completed', track, { at: Date.now() - 1000 });
    const profile = buildAiTasteProfile([]);
    const scored = scoreTrackByTaste(track, profile);
    expect(profile.favoriteArtists).toContain('artist');
    expect(scored.score).toBeGreaterThan(0);
  });
});
