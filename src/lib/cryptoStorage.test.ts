import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The crypto layer only needs a key/value round-trip from IndexedDB, and
 * neither the node nor the jsdom test environment provides IndexedDB, so the
 * idb helper is replaced with an in-memory map. Everything else - WebCrypto
 * (Node's webcrypto), btoa/atob and localStorage - is real or stubbed below.
 */
const hoisted = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock('@/lib/idb', () => ({
  withStore: async (
    _name: string,
    _version: number,
    _storeName: string,
    _mode: string,
    run: (api: unknown) => unknown,
  ) => {
    const api = {
      get: (key: string) => ({ kind: 'get' as const, key }),
      put: (record: { key: string }) => ({ kind: 'put' as const, record }),
    };
    const req = run(api) as
      | { kind: 'get'; key: string }
      | { kind: 'put'; record: { key: string } }
      | undefined;
    if (!req) return undefined;
    if (req.kind === 'get') return hoisted.store.get(req.key);
    hoisted.store.set(req.record.key, req.record);
    return req.record.key;
  },
}));

const { createEncryptedStorage, decryptString, encryptString } = await import('./cryptoStorage');

const STORE_NAME = 'aurora.test.auth';
let ls: Map<string, string>;

beforeEach(() => {
  ls = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => ls.get(key) ?? null,
    setItem: (key: string, value: string) => {
      ls.set(key, value);
    },
    removeItem: (key: string) => {
      ls.delete(key);
    },
  });
});

describe('encryptString / decryptString', () => {
  it('往返加解密保持一致', async () => {
    const encrypted = await encryptString('MUSIC_U=abc123; __csrf=def');
    expect(encrypted).toMatch(/^enc\.v1\./);
    expect(await decryptString(encrypted as string)).toBe('MUSIC_U=abc123; __csrf=def');
  });

  it('同一明文两次加密结果不同（IV 随机）', async () => {
    const a = await encryptString('same');
    const b = await encryptString('same');
    expect(a).not.toBe(b);
    expect(await decryptString(a as string)).toBe('same');
    expect(await decryptString(b as string)).toBe('same');
  });

  it('非本格式的输入不当作密文处理', async () => {
    expect(await decryptString('{"state":{"cookie":"plain"}}')).toBeNull();
    expect(await decryptString('enc.v1.garbage')).toBeNull();
  });

  it('认证失败的密文返回 null 而不抛错', async () => {
    const iv = btoa(String.fromCharCode(...new Uint8Array(12)));
    const bogus = btoa(String.fromCharCode(...new Uint8Array(24)));
    expect(await decryptString('enc.v1.' + iv + '.' + bogus)).toBeNull();
  });
});

/**
 * Poll until `check()` holds, or fail after `timeoutMs`.
 *
 * Needed because the plaintext-to-ciphertext upgrade inside getItem is
 * deliberately fire-and-forget, and it spans several awaits (device key lookup
 * through the mocked IndexedDB, then WebCrypto). A single setTimeout(0) is not a
 * reliable synchronisation point for that, which made this test flake.
 */
async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (check()) return;
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('createEncryptedStorage', () => {
  it('写入后 localStorage 里不含明文', async () => {
    const storage = createEncryptedStorage();
    await storage.setItem(STORE_NAME, '{"state":{"cookie":"SECRET_COOKIE"}}');

    const raw = ls.get(STORE_NAME) ?? '';
    expect(raw).toMatch(/^enc\.v1\./);
    expect(raw).not.toContain('SECRET_COOKIE');
    expect(await storage.getItem(STORE_NAME)).toBe('{"state":{"cookie":"SECRET_COOKIE"}}');
  });

  it('旧版明文值可被读取，并就地升级为密文（迁移路径）', async () => {
    const legacy = '{"state":{"cookie":"LEGACY_COOKIE"},"version":0}';
    ls.set(STORE_NAME, legacy);

    const storage = createEncryptedStorage();
    expect(await storage.getItem(STORE_NAME)).toBe(legacy);

    await waitFor(() => (ls.get(STORE_NAME) ?? '').startsWith('enc.v1.'));
    const raw = ls.get(STORE_NAME) ?? '';
    expect(raw).toMatch(/^enc\.v1\./);
    expect(raw).not.toContain('LEGACY_COOKIE');
  });

  it('无法解密的残留值会被丢弃，而不是让应用带着坏会话启动', async () => {
    const iv = btoa(String.fromCharCode(...new Uint8Array(12)));
    const bogus = btoa(String.fromCharCode(...new Uint8Array(24)));
    ls.set(STORE_NAME, 'enc.v1.' + iv + '.' + bogus);

    const storage = createEncryptedStorage();
    expect(await storage.getItem(STORE_NAME)).toBeNull();
    expect(ls.has(STORE_NAME)).toBe(false);
  });

  it('removeItem 清空条目', async () => {
    const storage = createEncryptedStorage();
    await storage.setItem(STORE_NAME, 'x');
    expect(ls.has(STORE_NAME)).toBe(true);
    storage.removeItem(STORE_NAME);
    expect(ls.has(STORE_NAME)).toBe(false);
    expect(await storage.getItem(STORE_NAME)).toBeNull();
  });
});
