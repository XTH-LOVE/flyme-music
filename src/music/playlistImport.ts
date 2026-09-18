import { getNeteasePlaylistDetail } from '@/music/netease/netease-api';
import type { MusicTrack } from '@/music/source/types';

export type ExternalPlaylistProvider = 'netease' | 'qq';

export interface ExternalPlaylistRef {
  provider: ExternalPlaylistProvider;
  id: string;
}

/** Parse the two common public playlist URL forms, plus a bare numeric id. */
export function parseExternalPlaylistUrl(input: string): ExternalPlaylistRef | null {
  const value = input.trim();
  if (!value) return null;

  // Netease: music.163.com/#/playlist?id=123, /playlist?id=123, or /playlist/123
  // The character class must allow '#': Netease uses a hash router, so the id
  // sit behind '/#/playlist?id=...' - excluding '#' silently rejected the exact
  // form users copy out of the address bar.
  const neteaseId =
    value.match(/music\.163\.com\/[^\s]*[?#&]id=(\d+)/i)?.[1] ??
    value.match(/music\.163\.com\/playlist\/(\d+)/i)?.[1];
  if (neteaseId) return { provider: 'netease', id: neteaseId };

  // QQ: y.qq.com/n/ryqq/playlist/123456 (the public pages use this form).
  const qqId = value.match(/y\.qq\.com\/[^\s]*playlist\/(\d+)/i)?.[1];
  if (qqId) return { provider: 'qq', id: qqId };

  // A bare numeric value is useful when the user copied just the Netease id.
  if (/^\d+$/.test(value)) return { provider: 'netease', id: value };
  return null;
}

export interface ImportedPlaylist {
  provider: ExternalPlaylistProvider;
  id: string;
  name: string;
  description: string;
  tracks: MusicTrack[];
}

/**
 * Import a public playlist. Netease has a complete, already-tested detail
 * client in this app. QQ's public playlist API requires a different signed
 * endpoint and is not the same as its chart API; fail explicitly rather than
 * importing an empty local playlist and telling the user it worked.
 */
export async function importExternalPlaylist(input: string): Promise<ImportedPlaylist> {
  const ref = parseExternalPlaylistUrl(input);
  if (!ref) throw new Error('请粘贴网易云或 QQ 歌单链接，或输入网易云歌单 ID');
  if (ref.provider === 'qq') {
    throw new Error('QQ 歌单导入接口需要登录态，当前版本暂不支持；可先导入网易云歌单');
  }

  const detail = await getNeteasePlaylistDetail(ref.id);
  return {
    provider: ref.provider,
    id: ref.id,
    name: detail.meta.name,
    description: detail.meta.description ?? '',
    tracks: detail.tracks,
  };
}
