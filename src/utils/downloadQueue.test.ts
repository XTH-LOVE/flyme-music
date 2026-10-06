import { describe, expect, it, vi } from 'vitest';

vi.mock('./download', () => ({
  downloadTrack: vi.fn(() => Promise.resolve()),
}));

import { enqueueDownload, getDownloadTasks } from './downloadQueue';
import type { MusicTrack } from '@/music/source/types';

const track: MusicTrack = {
  id: 'offline-1',
  name: 'Offline',
  artist: ['Aurora'],
  album: 'Test',
  pic_id: 'offline-1',
  url_id: 'offline-1',
  lyric_id: 'offline-1',
  source: 'netease',
};

describe('download queue persistence', () => {
  it('deduplicates active tasks', () => {
    const first = enqueueDownload(track);
    const second = enqueueDownload(track);
    expect(second.id).toBe(first.id);
    expect(getDownloadTasks().filter((task) => task.id === first.id)).toHaveLength(1);
  });
});

