import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpFetch, isTauri } from './apiTransport';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isTauri', () => {
  it('浏览器环境为 false', () => {
    vi.stubGlobal('window', {});
    expect(isTauri()).toBe(false);
  });

  it('注入 __TAURI_INTERNALS__ 后为 true', () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    expect(isTauri()).toBe(true);
  });
});

describe('httpFetch', () => {
  it('浏览器环境直接走 window.fetch', async () => {
    const spy = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch', spy);
    const res = await httpFetch('/api/img?url=x');
    expect(spy).toHaveBeenCalledWith('/api/img?url=x', undefined);
    expect(await res.text()).toBe('ok');
  });
});
