import { BaseMusicProvider } from '../base-provider';
import { resolveViaJoox } from '../joox-fallback';
import { getQqLyric, searchQqSongs } from '../../qq/qq-api';
import type { MusicSource, MusicTrack, SearchPageResult, SongLyric } from '../types';

/**
 * QQ Music source.
 * Search and chart data come from QQ official endpoints; playback is resolved
 * via Joox (match by song name + artist, then take the Joox stream), because
 * QQ vkey streams are login/VIP-gated while Joox streams are open.
 */
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

  /** QQ vkey streams are gated, so play the Joox match instead. */
  async getUrl(track: MusicTrack, br = 192): Promise<string | null> {
    return resolveViaJoox(track, br);
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