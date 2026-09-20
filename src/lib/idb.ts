/** Minimal promise wrapper over IndexedDB, shared by the offline audio cache
 * and the local file library. Fails soft: callers decide their fallbacks. */

export function openDb(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

export function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** Open (creating if needed) one object store for a one-shot transaction. */
export async function withStore<T = unknown>(
  name: string,
  version: number,
  storeName: string,
  mode: IDBTransactionMode,
  // `any` is deliberate, not laziness: IDBRequest is invariant in T through the
  // `this` type of its onerror/onsuccess handlers, so no narrower type accepts
  // both IDBRequest<value> (get/getAll) and IDBRequest<IDBValidKey>
  // (put/add/delete). `unknown` was tried and fails to compile at every call
  // site. The caller owns the expected shape via the T type parameter.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  run: (store: IDBObjectStore) => IDBRequest<any> | void,
): Promise<T | undefined> {
  const db = await openDb(name, version, (db) => {
    if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'key' });
  });
  try {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = run(store);
    const result = request ? await reqToPromise(request) : undefined;
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
    });
    return result;
  } finally {
    db.close();
  }
}
