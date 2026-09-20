import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpFetch, isTauri } from './apiTransport';

const { tauriFetchMock } = vi.hoisted(() => ({ tauriFetchMock: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: tauriFetchMock }));

beforeEach(() => {
  // 必须用块体：mockReset() 返回 spy 本身，表达式体会把返回值交给 vitest
  // 当作 cleanup 钩子，导致每个用例结束后 spy 被额外 0 参调用一次
  tauriFetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules(); // 模块级 tauriFetch 懒加载缓存不能跨用例粘住
});

/** 取一份全新的 apiTransport（配合 resetModules 清掉懒加载缓存）。 */
const loadTransport = () => import('./apiTransport');
const stubTauriWindow = () => vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });

describe('isTauri', () => {
  it('无 window（node/SSR）时为 false', () => {
    expect(isTauri()).toBe(false);
  });

  it('浏览器环境为 false', () => {
    vi.stubGlobal('window', {});
    expect(isTauri()).toBe(false);
  });

  it('注入 __TAURI_INTERNALS__ 后为 true', () => {
    stubTauriWindow();
    expect(isTauri()).toBe(true);
  });
});

describe('httpFetch 浏览器分支', () => {
  it('直接走全局 fetch 并原样透传 init', async () => {
    const spy = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch', spy);
    const init = { headers: { Accept: 'application/json' } };
    const res = await httpFetch('/api/img?url=x', init);
    expect(spy).toHaveBeenCalledWith('/api/img?url=x', init);
    expect(tauriFetchMock).not.toHaveBeenCalled();
    expect(await res.text()).toBe('ok');
  });
});

describe('httpFetch Tauri 分支', () => {
  it('走 plugin-http 并原样透传 input/init', async () => {
    stubTauriWindow();
    tauriFetchMock.mockResolvedValue(new Response('tauri-ok'));
    const fresh = await loadTransport();
    const init = { headers: { Referer: 'https://y.qq.com/' } };
    const res = await fresh.httpFetch('https://u.y.qq.com/cover.jpg', init);
    expect(tauriFetchMock).toHaveBeenCalledWith('https://u.y.qq.com/cover.jpg', init);
    expect(await res.text()).toBe('tauri-ok');
  });

  it('相对 URL 报可读错误且不进 IPC', async () => {
    stubTauriWindow();
    const fresh = await loadTransport();
    await expect(fresh.httpFetch('/api/img?url=x')).rejects.toThrow(/absolute URL/);
    expect(tauriFetchMock).not.toHaveBeenCalled();
  });

  it('取消时归一化为 AbortError（与浏览器一致）', async () => {
    stubTauriWindow();
    const ctrl = new AbortController();
    tauriFetchMock.mockImplementation(async () => {
      ctrl.abort();
      throw new Error('Request cancelled');
    });
    const fresh = await loadTransport();
    await expect(
      fresh.httpFetch('https://music-api.gdstudio.xyz/api.php', { signal: ctrl.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('非取消错误原样抛出', async () => {
    stubTauriWindow();
    tauriFetchMock.mockRejectedValue(new Error('url not allowed on the configured scope'));
    const fresh = await loadTransport();
    await expect(fresh.httpFetch('https://a.test/x')).rejects.toThrow(/not allowed/);
  });
});
