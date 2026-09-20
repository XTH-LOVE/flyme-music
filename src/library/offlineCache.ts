import { isTauri, httpFetch } from '@/lib/apiTransport';
import { withStore } from '@/lib/idb';
import type { MusicTrack } from '@/music/source/types';

/**
 * Offline audio cache: resolved stream bytes stored in IndexedDB so tracks
 * replay with zero network (and serve same-origin blob: URLs, which also
 * unlock the Web Audio analyser). LRU-evicted over a byte budget.
 */

const DB_NAME = 'aurora-offline';
const DB_VERSION = 1;
const STORE = 'audio';
const MAX_BYTES = 500 * 1024 * 1024;

interface AudioRecord {
  key: string;
  blob: Blob;
  size: number;
  cachedAt: number;
}

const trackKeyOf = (track: MusicTrack) => track.source + ':' + track.url_id;

/** Live object URLs handed out for cached blobs, revoked when replaced. */
const liveUrls = new Map<string, string>();
/** In-memory hint so resolveTrackUrl can skip an IDB roundtrip after boot. */
const knownCached = new Set<string>();

function blobUrlFor(key: string, blob: Blob): string {
  const existing = liveUrls.get(key);
  if (existing) URL.revokeObjectURL(existing);
  const url = URL.createObjectURL(blob);
  liveUrls.set(key, url);
  return url;
}

/** Fetch stream bytes CORS-free: Tauri core direct, browser via own proxy. */
async function fetchAudioBlob(url: string): Promise<Blob> {
  if (isTauri()) {
    const res = await httpFetch(url);
    if (!res.ok) throw new Error('缓存下载失败：' + res.status);
    return res.blob();
  }
  try {
    const direct = await fetch(url, { mode: 'cors' });
    if (direct.ok) return direct.blob();
  } catch {
    /* fall through to the proxy */
  }
  const res = await fetch('/api/media-proxy?url=' + encodeURIComponent(url));
  if (!res.ok) throw new Error('缓存下载失败：' + res.status);
  return res.blob();
}

/** Download and store the stream for later offline playback. */
export async function cacheTrackAudio(track: MusicTrack, streamUrl: string): Promise<void> {
  const blob = await fetchAudioBlob(streamUrl);
  const key = trackKeyOf(track);
  await withStore<AudioRecord>(DB_NAME, DB_VERSION, STORE, 'readwrite', (store) =>
    store.put({ key, blob, size: blob.size, cachedAt: Date.now() } satisfies AudioRecord),
  );
  knownCached.add(key);
  await evictOverBudget();
}

export async function isTrackCached(track: MusicTrack): Promise<boolean> {
  const key = trackKeyOf(track);
  if (knownCached.has(key)) return true;
  try {
    const record = await withStore<AudioRecord | undefined>(DB_NAME, DB_VERSION, STORE, 'readonly', (store) =>
      store.get(key),
    );
    if (record) knownCached.add(key);
    return Boolean(record);
  } catch {
    return false;
  }
}

/** Object URL for the cached stream, or null on a miss. */
export async function getStreamUrl(track: MusicTrack): Promise<string | null> {
  const key = trackKeyOf(track);
  if (!knownCached.has(key)) {
    try {
      const record = await withStore<AudioRecord | undefined>(DB_NAME, DB_VERSION, STORE, 'readonly', (store) =>
        store.get(key),
      );
      if (!record) return null;
      knownCached.add(key);
      return blobUrlFor(key, record.blob);
    } catch {
      return null;
    }
  }
  try {
    const record = await withStore<AudioRecord | undefined>(DB_NAME, DB_VERSION, STORE, 'readonly', (store) =>
      store.get(key),
    );
    if (!record) {
      knownCached.delete(key);
      return null;
    }
    return blobUrlFor(key, record.blob);
  } catch {
    return null;
  }
}

export async function removeCachedTrack(track: MusicTrack): Promise<void> {
  const key = trackKeyOf(track);
  await withStore(DB_NAME, DB_VERSION, STORE, 'readwrite', (store) => {
    store.delete(key);
  });
  knownCached.delete(key);
  const url = liveUrls.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    liveUrls.delete(key);
  }
}

export async function clearOfflineCache(): Promise<void> {
  await withStore(DB_NAME, DB_VERSION, STORE, 'readwrite', (store) => {
    store.clear();
  });
  knownCached.clear();
  for (const [key, url] of liveUrls) {
    URL.revokeObjectURL(url);
    liveUrls.delete(key);
  }
}

export interface OfflineStats {
  count: number;
  bytes: number;
}

export async function offlineStats(): Promise<OfflineStats> {
  try {
    const all = await withStore<AudioRecord[]>(DB_NAME, DB_VERSION, STORE, 'readonly', (store) => store.getAll());
    return { count: all?.length ?? 0, bytes: (all ?? []).reduce((n, r) => n + (r.size || 0), 0) };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

/** Drop the oldest cached streams until the store fits the byte budget. */
async function evictOverBudget(): Promise<void> {
  const all = await withStore<AudioRecord[]>(DB_NAME, DB_VERSION, STORE, 'readonly', (store) => store.getAll());
  if (!all || all.length === 0) return;
  const total = all.reduce((n, r) => n + (r.size || 0), 0);
  if (total <= MAX_BYTES) return;
  const victims = all
    .slice()
    .sort((a, b) => a.cachedAt - b.cachedAt)
    .filter((r) => !liveUrls.has(r.key));
  let excess = total - MAX_BYTES;
  const doomed: string[] = [];
  for (const record of victims) {
    if (excess <= 0) break;
    excess -= record.size || 0;
    doomed.push(record.key);
  }
  for (const key of doomed) {
    await withStore(DB_NAME, DB_VERSION, STORE, 'readwrite', (store) => {
      store.delete(key);
    });
    knownCached.delete(key);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
