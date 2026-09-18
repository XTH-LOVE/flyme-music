import { BaseMusicProvider } from '../base-provider';
import { requestMusicApiJSON } from '../provider-utils';
import { getQqLyric, searchQqSongs } from '../../qq/qq-api';
import type { RawApiTrack } from '../types';
import type { MusicSource, MusicTrack, SearchPageResult, SongLyric } from '../types';

/**
 * QQ Music source.
 * Search and chart data come from QQ official endpoints; playback is resolved
 * via Joox (match by song name + artist, then take the Joox stream), because
 * QQ vkey streams are login/VIP-gated while Joox streams are open.
 */
const norm = (s: string) => s.toLowerCase().replace(/[\s()（）《》.,!?'"-]/g, '');

/** track.id -> resolved joox stream url (TTL: stream links expire). */
const JOOX_URL_TTL_MS = 10 * 60 * 1000;
const jooxUrlCache = new Map<string, { url: string; expiresAt: number }>();

export class QqProvider extends BaseMusicProvider {
  source = 'qq' as MusicSource;

  /**
   * QQ 官方搜索。
   *
   * 基类的 search() 走 GD 聚合 API，而 GD **不支持** `tencent` 源（实测返回
   * "Value of `source` is not supported"）。所以这里必须覆盖 —— 否则
   * search() 抛出的错误会被调用方的 catch 吞掉，表现为"搜索永远没有结果"。
   */
  async search(
    query: string,
    page: number,
    count: number,
    signal?: AbortSignal,
  ): Promise<SearchPageResult<MusicTrack>> {
    return searchQqSongs(query, page, count, signal);
  }

  /** Match the QQ track against Joox search and resolve a Joox stream. */
  async getUrl(track: MusicTrack, br = 192): Promise<string | null> {
    const cached = jooxUrlCache.get(track.id);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    if (cached) jooxUrlCache.delete(track.id);
    try {
      const query = track.name + ' ' + (track.artist[0] ?? '');
      const results = await requestMusicApiJSON<RawApiTrack[]>(
        { types: 'search', source: 'joox', name: query, count: 5, pages: 1 },
      );
      if (!results.length) return null;
      const target = norm(track.name);
      const pick =
        results.find((r) => norm(r.name) === target) ?? results[0];
      const urlRes = await requestMusicApiJSON<{ url?: string }>({
        types: 'url',
        source: 'joox',
        id: pick.url_id,
        br,
      });
      if (urlRes.url) {
        jooxUrlCache.set(track.id, { url: urlRes.url, expiresAt: Date.now() + JOOX_URL_TTL_MS });
        return urlRes.url;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Lyrics still come from QQ official (real LRC). */
  async getLyric(track: MusicTrack): Promise<SongLyric | null> {
    try {
      const { lyric, trans } = await getQqLyric(track.url_id);
      return { lyric, tlyric: trans };
    } catch {
      return null;
    }
  }

  /** Chart tracks already carry their cover URL. */
  async getPic(): Promise<string | null> {
    return null;
  }
}