import { withStore } from '@/lib/idb';
import { FEATURES_VERSION, type FeatureCard } from './types';

const DB_NAME = 'aurora-analysis';
const DB_VERSION = 1;
const STORE = 'features';

interface StoredCard {
  key: string;
  card: FeatureCard;
}

/**
 * Feature cards are cached by track identity and version.
 *
 * Analysis costs a full decode plus a signal pass, so it must happen once per
 * track, not once per question. The version is part of the key so a change to
 * the extractor invalidates old cards instead of silently mixing results from
 * two different algorithms.
 */
function storageKey(trackKey: string): string {
  return `v${FEATURES_VERSION}:${trackKey}`;
}

export async function readCachedCard(trackKey: string): Promise<FeatureCard | null> {
  try {
    const row = await withStore<StoredCard | undefined>(
      DB_NAME,
      DB_VERSION,
      STORE,
      'readonly',
      (store) => store.get(storageKey(trackKey)) as IDBRequest<StoredCard | undefined>,
    );
    return row?.card ?? null;
  } catch {
    // A cache miss is never fatal - the caller just analyses again.
    return null;
  }
}

export async function writeCachedCard(trackKey: string, card: FeatureCard): Promise<void> {
  try {
    await withStore<unknown>(DB_NAME, DB_VERSION, STORE, 'readwrite', (store) =>
      store.put({ key: storageKey(trackKey), card } satisfies StoredCard),
    );
  } catch {
    /* quota or private mode - analysis still works, it just is not cached */
  }
}

export async function clearCachedCards(): Promise<void> {
  try {
    await withStore<unknown>(DB_NAME, DB_VERSION, STORE, 'readwrite', (store) => store.clear());
  } catch {
    /* ignore */
  }
}

/** Every cached card, used to build the local similarity index. */
export async function listCachedCards(): Promise<FeatureCard[]> {
  try {
    const rows = await withStore<StoredCard[]>(DB_NAME, DB_VERSION, STORE, 'readonly', (store) =>
      store.getAll() as IDBRequest<StoredCard[]>,
    );
    return (rows ?? [])
      .map((r) => r.card)
      .filter((c) => c && c.version === FEATURES_VERSION);
  } catch {
    return [];
  }
}
