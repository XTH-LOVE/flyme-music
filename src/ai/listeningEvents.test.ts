import { beforeEach, describe, expect, it } from 'vitest';
import { clearListeningEvents, countListeningEvents, loadListeningEvents, logListeningEvent } from './listeningEvents';
import type { MusicTrack } from '@/music/source/types';

const track: MusicTrack = { id: '1', name: 'Song', artist: ['Artist'], album: 'Album', pic_id: '', url_id: '', lyric_id: '', source: 'mock' };

describe('listening events', () => {
  beforeEach(() => { localStorage.clear(); clearListeningEvents(); });

  it('stores behavior signals and deduplicates duplicate snapshots', () => {
    logListeningEvent('started', track, { at: 1000 });
    logListeningEvent('started', track, { at: 1200 });
    logListeningEvent('completed', track, { at: 2000 });
    expect(loadListeningEvents()).toHaveLength(2);
    expect(countListeningEvents('completed')).toBe(1);
  });
});
