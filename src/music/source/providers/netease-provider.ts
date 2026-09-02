import { BaseMusicProvider } from '../base-provider';
import type { MusicSource, MusicTrack } from '../types';
import { callWeapi } from '../../netease/netease-api';

interface PendingPic {
  id: string;
  resolve: (url: string | null) => void;
}

let picQueue: PendingPic[] = [];
let picTimer: number | null = null;

async function flushPicQueue(): Promise<void> {
  const batch = picQueue;
  picQueue = [];
  picTimer = null;
  const ids = [...new Set(batch.map((p) => p.id))];
  const urlById = new Map<string, string>();
  try {
    // One official batch call replaces N single GD lookups.
    const r = await callWeapi<{
      code: number;
      songs?: Array<{ id: number; al?: { picUrl?: string } }>;
    }>(
      '/weapi/v3/song/detail',
      {
        c: JSON.stringify(ids.map((id) => ({ id: Number(id) }))),
        ids: JSON.stringify(ids),
      },
    );
    for (const s of r.songs ?? []) {
      if (s.al?.picUrl) urlById.set(String(s.id), s.al.picUrl);
    }
  } catch {
    /* distribute empty results below */
  }
  for (const p of batch) p.resolve(urlById.get(p.id) ?? null);
}

/**
 * Netease source.
 * Search / playback URLs go through the GD API; covers are resolved via the
 * official batch song-detail endpoint, coalescing concurrent lookups (a page
 * of search results = one request instead of one per track).
 */
export class NeteaseProvider extends BaseMusicProvider {
  source = 'netease' as MusicSource;

  async getPic(track: MusicTrack, _size = 800): Promise<string | null> {
    return new Promise((resolve) => {
      picQueue.push({ id: track.id, resolve });
      if (picTimer === null) {
        picTimer = window.setTimeout(() => {
          void flushPicQueue();
        }, 40);
      }
    });
  }
}
