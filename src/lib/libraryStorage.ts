import { openDb, reqToPromise } from './idb';

const DB_NAME = 'aurora-library';
const DB_VERSION = 1;
const STORE = 'records';

function available(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function mirrorLibraryValue(key: string, value: unknown): Promise<void> {
  if (!available()) return;
  try {
    const db = await openDb(DB_NAME, DB_VERSION, (database) => {
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'key' });
    });
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key, value });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('library write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('library write aborted'));
    });
    db.close();
  } catch {
    // localStorage remains the synchronous fallback for private/old browsers.
  }
}

export async function hydrateLibraryValues(
  keys: string[],
): Promise<Record<string, unknown>> {
  if (!available()) return {};
  try {
    const db = await openDb(DB_NAME, DB_VERSION, (database) => {
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'key' });
    });
    const tx = db.transaction(STORE, 'readonly');
    const rows = await reqToPromise(tx.objectStore(STORE).getAll()) as Array<{ key?: string; value?: unknown }>;
    db.close();
    const wanted = new Set(keys);
    return Object.fromEntries(rows.filter((row) => row.key && wanted.has(row.key)).map((row) => [row.key, row.value]));
  } catch {
    return {};
  }
}
