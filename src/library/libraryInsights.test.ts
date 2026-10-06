import { describe, expect, it } from 'vitest';
import { buildLibraryInsights } from './libraryInsights';

describe('library insights', () => {
  it('aggregates artist, album, source and duration dimensions', () => {
    const result = buildLibraryInsights([
      { id: '1', name: 'a.mp3', artist: ['A'], album: 'X', pic_id: '', url_id: '', lyric_id: '', source: 'local', duration: 10 },
      { id: '2', name: 'b.flac', artist: ['A', 'B'], album: 'Y', pic_id: '', url_id: '', lyric_id: '', source: 'local', duration: 20 },
    ]);
    expect(result).toMatchObject({ tracks: 2, albums: 2, artists: 2, totalDuration: 30 });
    expect(result.formats).toEqual({ mp3: 1, flac: 1 });
  });
});
