import { BaseMusicProvider } from '../base-provider';
import {
  getHigequSongDetail,
  parseHigequRid,
  searchHigequSongs,
} from '@/music/higequ/higequ-api';
import type { MusicSource, MusicTrack, SearchPageResult, SongLyric } from '../types';

/**
 * Hi歌曲音乐网音源（https://higequ.com）。
 *
 * 与其它音源不同，它完全不走 GD 聚合 API：站点只有 PHP 渲染的 HTML，
 * 搜索/播放页都要抓下来解析，因此这里覆盖掉基类的全部四个方法。
 *
 * 上层只会传入 `higequ_{rid}` 形式的 ID；音频直链、封面、歌词都需要解析播放页，
 * 统一走 `getHigequSongDetail`（内部有播放页缓存 + 请求合并，一次播放只发一次请求）。
 */
export class HigequProvider extends BaseMusicProvider {
  source = 'higequ' as MusicSource;

  /** 站点每页固定 10 条，`count` 不生效；`hasMore` 用站点自己的分页状态。 */
  async search(
    query: string,
    page: number,
    _count: number,
    signal?: AbortSignal,
  ): Promise<SearchPageResult<MusicTrack>> {
    return searchHigequSongs(query, page, signal);
  }

  /** 站点只有单一 MP3 直链，`br` 参数不生效 */
  async getUrl(track: MusicTrack, _br = 192): Promise<string | null> {
    const rid = parseHigequRid(track.url_id || track.id);
    if (!rid) return null;
    return (await getHigequSongDetail(rid))?.audioUrl || null;
  }

  async getPic(track: MusicTrack, _size = 800): Promise<string | null> {
    const rid = parseHigequRid(track.pic_id || track.id);
    if (!rid) return null;
    return (await getHigequSongDetail(rid))?.coverUrl || null;
  }

  async getLyric(track: MusicTrack): Promise<SongLyric | null> {
    const rid = parseHigequRid(track.lyric_id || track.id);
    if (!rid) return null;
    const detail = await getHigequSongDetail(rid);
    if (!detail?.lyric) return null;
    return { lyric: detail.lyric, tlyric: '' };
  }
}
