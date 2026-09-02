import { callWeapi } from './netease/netease-api';

/**
 * Official charts clients.
 * Netease: /weapi/toplist (chart list) + existing playlist detail for tracks.
 * QQ: single client implementation lives in src/music/qq/qq-api.ts and is
 * re-exported below so page imports stay stable.
 */

export interface NetChart {
  id: string;
  name: string;
  coverUrl: string;
  firstTrackCoverUrl: string;
  updateFrequency: string;
}

/** 网易云官方榜单列表（真实，含封面与更新频率；封面缺失时用歌单详情兜底）。 */
export async function getNeteaseToplists(signal?: AbortSignal): Promise<NetChart[]> {
  const r = await callWeapi<{
    code: number;
    list?: { id: number; name: string; coverImgUrl?: string; updateFrequency?: string }[];
  }>('/weapi/toplist', {}, signal);
  if (r.code !== 200 || !r.list) throw new Error('netease toplist code ' + r.code);

  const picked = r.list.slice(0, 12);
  const charts = await Promise.all(
    picked.map(async (l) => {
      let cover = l.coverImgUrl ?? '';
      let firstTrackCover = '';
      if (!cover) {
        cover = '';
      }
      try {
        const detail = await callWeapi<{
          playlist?: { coverImgUrl?: string; tracks?: { al?: { picUrl?: string } }[] };
        }>(
          '/weapi/v3/playlist/detail',
          { id: String(l.id), offset: 0, total: true, limit: 1, n: 1, csrf_token: '' },
          signal,
        );
        firstTrackCover = detail.playlist?.tracks?.[0]?.al?.picUrl ?? '';
        if (!cover) cover = detail.playlist?.coverImgUrl ?? firstTrackCover;
      } catch {
        /* Keep the chart response usable when detail is rate-limited. */
      }
      const firstTrackCoverUrl = firstTrackCover || cover || '';
      return {
        id: String(l.id),
        name: l.name,
        coverUrl: cover ? cover + '?param=400y400' : '',
        firstTrackCoverUrl: firstTrackCoverUrl ? firstTrackCoverUrl + '?param=400y400' : '',
        updateFrequency: l.updateFrequency ?? '',
      };
    }),
  );
  return charts;
}

export interface QqChartConfig {
  topId: number;
  name: string;
  desc: string;
  palette: [string, string];
}

/** QQ 音乐官方榜单（固定配置 + 实时曲目）。 */
export const QQ_CHARTS: QqChartConfig[] = [
  { topId: 26, name: '热歌榜', desc: '播放热度前 300 · 每日更新', palette: ['#31C270', '#8CE8B8'] },
  { topId: 27, name: '新歌榜', desc: '新歌热度排名 · 每日更新', palette: ['#3D7BFF', '#9CB8FF'] },
  { topId: 62, name: '飙升榜', desc: '热度飙升最快 · 每日更新', palette: ['#FF6A5A', '#FFB0A0'] },
  { topId: 67, name: '听歌识曲榜', desc: '识曲热度 · 每日更新', palette: ['#F2A65A', '#FFD8A0'] },
  { topId: 4, name: '流行指数榜', desc: '流行风向标 · 每日更新', palette: ['#00B8B0', '#8CE8E2'] },
  { topId: 60, name: '抖音热歌榜', desc: '短视频热门 BGM · 每日更新', palette: ['#E86A8A', '#FFB8C8'] },
  { topId: 5, name: '内地榜', desc: '内地热门 · 每周更新', palette: ['#9C6BFF', '#D4B8FF'] },
  { topId: 65, name: '国风热歌榜', desc: '国风音乐热度 · 每周更新', palette: ['#C87A4F', '#F2C8A0'] },
  { topId: 66, name: 'ACG新歌榜', desc: '动漫游戏新歌 · 每周更新', palette: ['#7B4FE0', '#C8A8FF'] },
  { topId: 73, name: '游戏音乐榜', desc: '游戏原声热度 · 每周更新', palette: ['#5A6AD8', '#A8B8FF'] },
  { topId: 28, name: '网络歌曲榜', desc: '网络热歌 · 每周更新', palette: ['#2FA96B', '#A8E8C0'] },
  { topId: 52, name: '原创榜', desc: '腾讯音乐人原创 · 每周更新', palette: ['#D85A7A', '#FFC8D4'] },
  { topId: 63, name: 'DJ舞曲榜', desc: '电音舞曲热度 · 每周更新', palette: ['#009A93', '#80E0D8'] },
];

export { getQqChartTop, getQqChartDetail } from './qq/qq-api';
export type { QqChartTop, QqChartDetail } from './qq/qq-api';