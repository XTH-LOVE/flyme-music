import { describe, expect, it } from 'vitest';
import { flattenSearchSuggestions } from './search-suggestions';
import type { NetSearchMeta } from './netease-api';

describe('flattenSearchSuggestions', () => {
  it('keeps the display order artist, song, album, playlist', () => {
    const meta: NetSearchMeta = {
      artists: [{ id: 'a1', name: '周杰伦' }],
      songs: [{ id: 's1', name: '晴天', artist: '周杰伦', album: '叶惠美' }],
      albums: [{ id: 'al1', name: '叶惠美', artist: '周杰伦' }],
      playlists: [{ id: 'p1', name: '周杰伦精选', creator: '', trackCount: 10, playCount: 0 }],
    };

    expect(flattenSearchSuggestions(meta).map((item) => item.type)).toEqual([
      'artist',
      'song',
      'album',
      'playlist',
    ]);
  });
});
