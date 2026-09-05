import { withStore } from '@/lib/idb';
import type { MusicTrack } from '@/music/source/types';

/**
 * Local file library: audio files picked by the user live in IndexedDB
 * (blobs + parsed metadata), exposed to the player as MusicTracks with
 * source 'local'. Blob stream URLs are minted on demand and reused.
 */

const DB_NAME = 'aurora-local';
const DB_VERSION = 1;
const META_STORE = 'meta';
const BLOB_STORE = 'blobs';

export interface LocalFileMeta {
  key: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  size: number;
  addedAt: number;
}

const liveUrls = new Map<string, string>();
let seq = 0;

export function localTrackKey(fileKey: string): string {
  return 'local:' + fileKey;
}

function metaToTrack(meta: LocalFileMeta): MusicTrack {
  return {
    id: meta.key,
    name: meta.name,
    artist: [meta.artist],
    album: meta.album,
    pic_id: meta.key,
    url_id: meta.key,
    lyric_id: meta.key,
    source: 'local',
    duration: meta.duration || undefined,
  };
}

/** "Artist - Title.mp3" -> { artist, title }; falls back to the file name. */
export function parseFileName(fileName: string): { artist: string; title: string } {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  const parts = base.split(' - ');
  if (parts.length >= 2 && parts[0].trim() && parts.slice(1).join(' - ').trim()) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return { artist: '本地音乐', title: base };
}

function probeDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    audio.src = url;
  });
}

const AUDIO_EXT = /\.(mp3|flac|m4a|aac|ogg|opus|wav|webm)$/i;

/** Import picked files; skips non-audio and duplicates by name+size. */
export async function importLocalFiles(files: File[]): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;
  for (const file of files) {
    if (!AUDIO_EXT.test(file.name) && !file.type.startsWith('audio/')) {
      skipped += 1;
      continue;
    }
    const parsed = parseFileName(file.name);
    const duration = await probeDuration(file);
    const key = 'f' + Date.now().toString(36) + '-' + (seq++).toString(36);
    const meta: LocalFileMeta = {
      key,
      name: parsed.title,
      artist: parsed.artist,
      album: '',
      duration,
      size: file.size,
      addedAt: Date.now(),
    };
    await withStore<LocalFileMeta>(DB_NAME, DB_VERSION, META_STORE, 'readwrite', (store) =>
      store.put(meta),
    );
    await withStore(DB_NAME, DB_VERSION, BLOB_STORE, 'readwrite', (store) => {
      store.put({ key, blob: file });
    });
    imported += 1;
  }
  return { imported, skipped };
}

export async function getAllLocalTracks(): Promise<MusicTrack[]> {
  try {
    const metas = await withStore<LocalFileMeta[]>(DB_NAME, DB_VERSION, META_STORE, 'readonly', (store) =>
      store.getAll(),
    );
    return (metas ?? [])
      .sort((a, b) => a.addedAt - b.addedAt)
      .map(metaToTrack);
  } catch {
    return [];
  }
}

/** Object URL for a local file's bytes; reused across calls. */
export async function getLocalStreamUrl(track: MusicTrack): Promise<string | null> {
  const key = track.url_id;
  const existing = liveUrls.get(key);
  if (existing) return existing;
  try {
    const record = await withStore<{ key: string; blob: Blob } | undefined>(
      DB_NAME,
      DB_VERSION,
      BLOB_STORE,
      'readonly',
      (store) => store.get(key),
    );
    if (!record) return null;
    const url = URL.createObjectURL(record.blob);
    liveUrls.set(key, url);
    return url;
  } catch {
    return null;
  }
}

export async function deleteLocalTrack(track: MusicTrack): Promise<void> {
  const key = track.url_id;
  await withStore(DB_NAME, DB_VERSION, META_STORE, 'readwrite', (store) => {
    store.delete(key);
  });
  await withStore(DB_NAME, DB_VERSION, BLOB_STORE, 'readwrite', (store) => {
    store.delete(key);
  });
  const url = liveUrls.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    liveUrls.delete(key);
  }
}
