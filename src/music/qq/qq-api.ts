import { httpFetch, isTauri } from '@/lib/apiTransport';
import type { MusicTrack } from '../source/types';

/**
 * QQ Music official endpoints - the single client implementation.
 * Packaged app: plugin-http with an explicit Referer. Browser dev: the
 * generic /api/proxy middleware (QQ rejects wrong referers and sends no
 * CORS headers).
 */
const QQ_REFERER = 'https://y.qq.com/';
const QQ_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchQqText(url: string, signal?: AbortSignal): Promise<string> {
  const res = isTauri()
    ? await httpFetch(url, { headers: { Referer: QQ_REFERER, 'User-Agent': QQ_UA }, signal })
    : await fetch(
        '/api/proxy?url=' + encodeURIComponent(url) + '&referer=' + encodeURIComponent(QQ_REFERER),
        { signal },
      );
  if (!res.ok) throw new Error('qq HTTP ' + res.status);
  return (await res.text()).replace(/^\uFEFF/, '');
}

interface MusicuDetail {
  detail?: {
    data?: {
      data?: {
        title?: string;
        song?: { title?: string; singerName?: string; cover?: string }[];
      };
    };
  };
}

interface LegacyChartSong {
  data?: {
    songid?: number;
    songmid?: string;
    songname?: string;
    interval?: number;
    albumname?: string;
    albummid?: string;
    singer?: { name?: string }[];
  };
}

interface LegacyChart {
  songlist?: LegacyChartSong[];
  topinfo?: { ListName?: string; info?: string };
  date?: string;
  total_song_num?: number;
}

const legacyChartUrl = (topId: number) =>
  'https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?tpl=3&page=detail&type=top&topid=' + topId;

async function fetchLegacyChart(topId: number, signal?: AbortSignal): Promise<LegacyChart> {
  return JSON.parse(await fetchQqText(legacyChartUrl(topId), signal)) as LegacyChart;
}

export interface QqChartTop {
  title: string;
  topSong: string;
  topSinger: string;
  cover: string;
}

/** 榜单头名信息（含第一首有封面的歌，用于榜单卡片）。 */
export async function getQqChartTop(topId: number, signal?: AbortSignal): Promise<QqChartTop> {
  const payload = JSON.stringify({
    detail: {
      module: 'musicToplist.ToplistInfoServer',
      method: 'GetDetail',
      param: { topId, offset: 0, num: 5 },
    },
  });
  const json = JSON.parse(
    await fetchQqText('https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(payload), signal),
  ) as MusicuDetail;
  const d = json.detail?.data?.data;
  const songs = d?.song ?? [];
  let cover = (songs.find((s) => s.cover)?.cover ?? '').replace(/^http:/, 'https:');
  if (!cover) {
    try {
      const legacy = await fetchLegacyChart(topId, signal);
      const mid = (legacy.songlist ?? []).map((s) => s.data?.albummid).find((m) => Boolean(m));
      if (mid) cover = 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + mid + '.jpg';
    } catch {
      /* keep empty */
    }
  }
  return {
    title: d?.title ?? '',
    topSong: songs[0]?.title ?? '',
    topSinger: songs[0]?.singerName ?? '',
    cover,
  };
}

export interface QqChartDetail {
  meta: {
    topId: number;
    title: string;
    titleDetail: string;
    period: string;
    intro: string;
    totalNum: number;
  };
  tracks: MusicTrack[];
}

/** 榜单详情（旧版接口，含 songmid / 时长 / 歌手 / 专辑）。 */
export async function getQqChartDetail(topId: number, signal?: AbortSignal): Promise<QqChartDetail> {
  const json = await fetchLegacyChart(topId, signal);
  if (!json.songlist) throw new Error('qq chart data missing');

  const tracks: MusicTrack[] = json.songlist
    .map((item) => item.data)
    .filter((d): d is NonNullable<typeof d> => Boolean(d && d.songmid))
    .map((d) => ({
      id: String(d.songid),
      name: d.songname ?? '',
      artist: (d.singer ?? []).map((s) => s.name ?? '').filter(Boolean),
      album: d.albumname ?? '',
      pic_id: d.albummid ?? String(d.songid),
      url_id: d.songmid ?? '',
      lyric_id: d.songmid ?? '',
      source: 'qq',
      duration: d.interval ?? 0,
      picUrl: d.albummid
        ? 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + d.albummid + '.jpg'
        : undefined,
    }));

  return {
    meta: {
      topId,
      title: json.topinfo?.ListName ?? '',
      titleDetail: json.topinfo?.ListName ?? '',
      period: json.date ?? '',
      intro: (json.topinfo?.info ?? '').replace(/<br>/g, ' '),
      totalNum: json.total_song_num ?? tracks.length,
    },
    tracks,
  };
}

/** 歌词（LRC 明文）。 */
export async function getQqLyric(
  mid: string,
  signal?: AbortSignal,
): Promise<{ lyric: string; trans: string }> {
  if (!mid) return { lyric: '', trans: '' };
  const json = JSON.parse(
    await fetchQqText(
      'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=' +
        encodeURIComponent(mid) +
        '&format=json&nobase64=1&g_tk=5381',
      signal,
    ),
  ) as { lyric?: string; trans?: string };
  return { lyric: json.lyric ?? '', trans: json.trans ?? '' };
}