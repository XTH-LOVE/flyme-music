import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseExternalPlaylistUrl } from './playlistImport';

describe('parseExternalPlaylistUrl', () => {
  it('recognises the hash-router Netease form (the one users actually copy)', () => {
    expect(parseExternalPlaylistUrl('https://music.163.com/#/playlist?id=123456')).toEqual({
      provider: 'netease',
      id: '123456',
    });
  });

  it('recognises the query form and the path form', () => {
    expect(parseExternalPlaylistUrl('https://music.163.com/playlist?id=123456')).toEqual({
      provider: 'netease',
      id: '123456',
    });
    expect(parseExternalPlaylistUrl('https://music.163.com/playlist/123456')).toEqual({
      provider: 'netease',
      id: '123456',
    });
  });

  it('recognises a QQ playlist page', () => {
    expect(parseExternalPlaylistUrl('https://y.qq.com/n/ryqq/playlist/88990011')).toEqual({
      provider: 'qq',
      id: '88990011',
    });
  });

  it('accepts a bare Netease id', () => {
    expect(parseExternalPlaylistUrl('  123456  ')).toEqual({ provider: 'netease', id: '123456' });
  });

  it('rejects empty input, prose and other hosts', () => {
    expect(parseExternalPlaylistUrl('')).toBeNull();
    expect(parseExternalPlaylistUrl('   ')).toBeNull();
    expect(parseExternalPlaylistUrl('周杰伦 晴天')).toBeNull();
    expect(parseExternalPlaylistUrl('https://example.com/playlist?id=1')).toBeNull();
  });
});

describe('importExternalPlaylist validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('refuses QQ instead of importing an empty playlist', async () => {
    const { importExternalPlaylist } = await import('./playlistImport');
    await expect(
      importExternalPlaylist('https://y.qq.com/n/ryqq/playlist/88990011'),
    ).rejects.toThrow(/暂不支持/);
  });
});
