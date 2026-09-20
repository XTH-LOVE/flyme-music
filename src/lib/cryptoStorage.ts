import { withStore } from '@/lib/idb';
import type { StateStorage } from 'zustand/middleware';

/**
 * Device-key encrypted storage for credentials that would otherwise sit in
 * localStorage as plain text - currently the Netease login cookie, which is a
 * full account credential.
 *
 * THREAT MODEL, stated honestly: the AES-GCM key lives in IndexedDB on the
 * same device, so this does NOT protect against script running in our own page
 * (an XSS can simply call decrypt). What it does protect against is the far
 * more common case - anything that reads localStorage *without* executing our
 * code: another app on a shared machine, a browser-extension dump, a
 * backup/sync tool, or someone reading devtools over your shoulder. Treat it
 * as defence in depth, not as a vault.
 *
 * Everything degrades gracefully: without WebCrypto (non-secure context) or
 * without IndexedDB (private mode) we fall back to plain localStorage rather
 * than breaking login.
 */

const KEY_DB = 'aurora-crypto';
const KEY_DB_VERSION = 1;
const KEY_STORE = 'keys';
const KEY_ID = 'device-key';
const ALGO = 'AES-GCM';
const IV_BYTES = 12;
/** Envelope marker, also used to tell encrypted values from legacy plaintext. */
const PREFIX = 'enc.v1.';

let memoryKey: CryptoKey | null = null;

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function subtleAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

async function readStoredKey(): Promise<CryptoKey | null> {
  const record = await withStore<{ key: string; raw: ArrayBuffer } | undefined>(
    KEY_DB,
    KEY_DB_VERSION,
    KEY_STORE,
    'readonly',
    (store) => store.get(KEY_ID),
  );
  if (!record?.raw) return null;
  return crypto.subtle.importKey('raw', record.raw, ALGO, false, ['encrypt', 'decrypt']);
}

async function createAndPersistKey(): Promise<CryptoKey> {
  const key = await crypto.subtle.generateKey({ name: ALGO, length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const raw = await crypto.subtle.exportKey('raw', key);
  await withStore(KEY_DB, KEY_DB_VERSION, KEY_STORE, 'readwrite', (store) =>
    store.put({ key: KEY_ID, raw }),
  );
  return key;
}

async function getDeviceKey(): Promise<CryptoKey | null> {
  if (memoryKey) return memoryKey;
  if (!subtleAvailable()) return null;
  try {
    memoryKey = (await readStoredKey()) ?? (await createAndPersistKey());
    return memoryKey;
  } catch {
    return null;
  }
}

/** Returns null when encryption is unavailable, so callers can fall back. */
export async function encryptString(plain: string): Promise<string | null> {
  const key = await getDeviceKey();
  if (!key) return null;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const cipher = await crypto.subtle.encrypt(
      { name: ALGO, iv },
      key,
      new TextEncoder().encode(plain),
    );
    return PREFIX + toBase64(iv) + '.' + toBase64(cipher);
  } catch {
    return null;
  }
}

export async function decryptString(payload: string): Promise<string | null> {
  if (!payload.startsWith(PREFIX)) return null;
  const key = await getDeviceKey();
  if (!key) return null;
  const [ivPart, dataPart] = payload.slice(PREFIX.length).split('.');
  if (!ivPart || !dataPart) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: ALGO, iv: fromBase64(ivPart) },
      key,
      fromBase64(dataPart),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/**
 * zustand `persist` storage that encrypts values transparently.
 *
 * Migration: a value written by the previous plaintext setup is returned as-is
 * and immediately rewritten encrypted, so existing logins survive the upgrade
 * without the user noticing. If a value cannot be decrypted (device key was
 * cleared with site data) it is dropped, so the app re-authenticates instead of
 * booting with a corrupt session.
 */
export function createEncryptedStorage(): StateStorage {
  const setItem = async (name: string, value: string): Promise<void> => {
    const encrypted = await encryptString(value);
    localStorage.setItem(name, encrypted ?? value);
  };

  const getItem = async (name: string): Promise<string | null> => {
    const raw = localStorage.getItem(name);
    if (!raw) return null;
    if (!raw.startsWith(PREFIX)) {
      void setItem(name, raw);
      return raw;
    }
    const plain = await decryptString(raw);
    if (plain !== null) return plain;
    localStorage.removeItem(name);
    return null;
  };

  const removeItem = (name: string): void => {
    localStorage.removeItem(name);
  };

  return { getItem, setItem, removeItem };
}
