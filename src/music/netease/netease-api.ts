import type { MusicTrack } from '../source/types';
import { useNeteaseAuthStore } from '@/store/useNeteaseAuthStore';

import { neteaseWeapi } from './neteaseWeapi';
import { httpFetch, isTauri } from '@/lib/apiTransport';

/**
 * Netease official API client. Encryption lives in weapi.ts; the transport
 * is the Rust command in the packaged app and the vite middleware in dev.
 * Covers: recommend playlists, playlist detail, playlist square (by category),
 * new songs and hot comments - all real online data.
 */
/** Business error with a human hint for Netease risk-control codes (-462 etc.). */
function codeError(what: string, code: number | undefined): Error {
  if (code !== undefined && [-462, 462, -460, 460, 512].includes(code)) {
    return new Error(
      '网易云暂时拦截了该请求（' + code + '），稍等片刻重试即可恢复；在「我的」登录网易云账号可大幅降低出现概率',
    );
  }
  return new Error(what + ' code ' + code);
}
/**
 * Legacy unencrypted GET channel (music.163.com/api/*). Not subject to the
 * weapi risk-control path. Browser relays through /api/proxy; the packaged
 * app goes straight through the Rust core.
 */
async function neteasePublicGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const target = 'https://music.163.com' + path;
  if (isTauri()) {
    const res = await httpFetch(target, {
      headers: { Referer: 'https://music.163.com', Cookie: 'os=pc; appver=2.9.7; mode=31' },
      signal,
    });
    if (!res.ok) throw new Error('netease legacy HTTP ' + res.status);
    return (await res.json()) as T;
  }
  const res = await fetch('/api/proxy?url=' + encodeURIComponent(target), { signal });
  if (!res.ok) throw new Error('netease legacy HTTP ' + res.status);
  return (await res.json()) as T;
}

export async function callWeapi<T>(
  path: string,
  data: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const { json } = await neteaseWeapi<T>(path, data, useNeteaseAuthStore.getState().cookie, signal);
  return json;
}

export interface NetPlaylistSummary {
  id: string;
  name: string;
  coverUrl: string;
  playCount: number;
  trackCount: number;
  description: string;
  /** Cursor for highquality pagination. */
  updateTime?: number;
}

interface RawRecommendItem {
  id: number;
  name: string;
  picUrl?: string;
  playCount?: number;
  trackCount?: number;
  copywriter?: string;
}

/** 推荐歌单（官方个性化推荐，真实在线数据）。 */
export async function getRecommendPlaylists(
  signal?: AbortSignal,
): Promise<NetPlaylistSummary[]> {
  const r = await callWeapi<{ code: number; result?: RawRecommendItem[] }>(
    '/weapi/personalized/playlist',
    { limit: 30, total: true, n: 1000 },
    signal,
  );
  if (!r.result) throw codeError('netease recommend', r.code);
  return r.result.map((p) => ({
    id: String(p.id),
    name: p.name,
    coverUrl: (p.picUrl || '') + '?param=400y400',
    playCount: p.playCount ?? 0,
    trackCount: p.trackCount ?? 0,
    description: p.copywriter ?? '',
  }));
}

interface RawHighQualityPlaylist {
  id: number;
  name: string;
  coverImgUrl?: string;
  playCount?: number;
  trackCount?: number;
  description?: string;
  updateTime?: number;
}

export interface PlaylistSquarePage {
  items: NetPlaylistSummary[];
  total: number;
  more: boolean;
  lasttime: number;
}

/** 歌单广场：按分类拉取精品歌单（真实，可翻页）。 */
export async function getHighQualityPlaylists(
  cat: string,
  lasttime = 0,
  limit = 20,
  signal?: AbortSignal,
): Promise<PlaylistSquarePage> {
  const r = await callWeapi<{
    code: number;
    playlists?: RawHighQualityPlaylist[];
    total?: number;
    more?: boolean;
  }>(
    '/weapi/playlist/highquality/list',
    { cat, limit, lasttime, total: true },
    signal,
  );
  if (r.code !== 200) throw codeError('netease highquality', r.code);
  const items = (r.playlists ?? []).map((p) => ({
    id: String(p.id),
    name: p.name,
    coverUrl: (p.coverImgUrl || '') + '?param=400y400',
    playCount: p.playCount ?? 0,
    trackCount: p.trackCount ?? 0,
    description: p.description ?? '',
    updateTime: p.updateTime,
  }));
  const last = items[items.length - 1];
  return {
    items,
    total: r.total ?? items.length,
    more: r.more ?? false,
    lasttime: last?.updateTime ?? lasttime,
  };
}

export interface NetPlaylistDetail {
  meta: NetPlaylistSummary & { creator: string };
  tracks: MusicTrack[];
}

export interface NeteaseCloudSong {
  track: MusicTrack;
  size?: number;
  bitrate?: number;
}

/** 登录账号的歌单（包含创建与收藏的歌单）。 */
export async function getNeteaseUserPlaylists(
  uid: string,
  signal?: AbortSignal,
): Promise<NetPlaylistSummary[]> {
  const r = await callWeapi<{
    code: number;
    playlist?: Array<{ id: number; name: string; coverImgUrl?: string; playCount?: number; trackCount?: number; description?: string }>;
  }>('/weapi/user/playlist', { uid, limit: 100, offset: 0, includeVideo: true }, signal);
  if (r.code !== 200) throw codeError('netease user playlist', r.code);
  return (r.playlist ?? []).map((p) => ({
    id: String(p.id),
    name: p.name,
    coverUrl: (p.coverImgUrl || '') + '?param=400y400',
    playCount: p.playCount ?? 0,
    trackCount: p.trackCount ?? 0,
    description: p.description ?? '',
  }));
}

/** 登录账号的云盘歌曲。 */
export async function getNeteaseCloudSongs(
  signal?: AbortSignal,
): Promise<NeteaseCloudSong[]> {
  const r = await callWeapi<{
    code: number;
    data?: Array<{ song?: RawSong; simpleSong?: RawSong; fileSize?: number; bitrate?: number }>;
  }>('/weapi/v1/cloud/get', { limit: 100, offset: 0, csrf_token: '' }, signal);
  if (r.code !== 200) throw codeError('netease cloud', r.code);
  return (r.data ?? []).flatMap((item) => {
    const song = item.song ?? item.simpleSong;
    return song ? [{ track: toTrack(song), size: item.fileSize, bitrate: item.bitrate }] : [];
  });
}

/** 登录账号收藏的歌曲。网易云返回歌曲 ID，再补充歌曲详情用于播放。 */
export async function getNeteaseLikedSongs(
  uid: string,
  signal?: AbortSignal,
): Promise<MusicTrack[]> {
  const liked = await callWeapi<{ code: number; ids?: number[] }>(
    '/weapi/song/like/get',
    { uid, csrf_token: '' },
    signal,
  );
  if (liked.code !== 200) throw codeError('netease liked songs', liked.code);
  const ids = (liked.ids ?? []).slice(0, 300);
  if (!ids.length) return [];
  const songs = await callWeapi<{ code: number; songs?: RawSong[] }>(
    '/weapi/v3/song/detail',
    { c: JSON.stringify(ids.map((id) => ({ id }))), ids: JSON.stringify(ids) },
    signal,
  );
  if (songs.code !== 200) throw codeError('netease liked detail', songs.code);
  return (songs.songs ?? []).map(toTrack);
}

interface RawSong {
  id: number;
  name: string;
  dt?: number;
  ar?: { id: number; name: string }[];
  al?: { id: number; name: string; picUrl?: string; picId?: number | string };
}

function toTrack(s: RawSong): MusicTrack {
  return {
    id: String(s.id),
    name: s.name,
    artist: (s.ar ?? []).map((a) => a.name).filter(Boolean),
    album: s.al?.name ?? '',
    pic_id: String(s.al?.picId ?? s.al?.id ?? s.id),
    url_id: String(s.id),
    lyric_id: String(s.id),
    source: 'netease',
    duration: Math.round((s.dt ?? 0) / 1000),
    picUrl: s.al?.picUrl,
  };
}

/**
 * Legacy endpoints (/api/album, /api/artists, /api/playlist/detail) return
 * the pre-v3 song schema (artists / album / duration); normalize either
 * schema into a MusicTrack.
 */
function toTrackAny(
  s: RawSong & { artists?: { name: string }[]; album?: { name?: string; picUrl?: string }; duration?: number },
): MusicTrack {
  if (s.ar || s.al) return toTrack(s);
  return toTrack({
    id: s.id,
    name: s.name,
    ar: (s.artists ?? []).map((a) => ({ id: 0, name: a.name })),
    al: { id: 0, name: s.album?.name ?? '', picUrl: s.album?.picUrl, picId: 0 },
    dt: s.duration,
  } as RawSong);
}

/** 歌单详情：歌单元信息 + 完整歌曲列表（真实曲目，可直接播放）。 */
export async function getNeteasePlaylistDetail(
  playlistId: string,
  signal?: AbortSignal,
): Promise<NetPlaylistDetail> {
  return withRiskRetry(async () => {
  try {
    return await fetchPlaylistDetailWeapi(playlistId, signal);
  } catch (e) {
    // weapi 是网易风控的重灾区（海外出口间歇性 -462，深夜尤甚）；
    // 网易的老非加密接口不受该风控路径影响，作为兑底通道。
    if (isRiskError(e) && !signal?.aborted) {
      return getPlaylistDetailLegacy(playlistId, signal);
    }
    throw e;
  }
  });
}

function isRiskError(e: unknown): boolean {
  return e instanceof Error && e.message.includes('网易云');
}

/**
 * Netease datacenter-IP risk control (-462) is PROBABILISTIC: a fraction of
 * requests are blocked while identical retries succeed. Retry risk errors a
 * few times with a short backoff before surfacing the failure.
 */
async function withRiskRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await run();
    } catch (e) {
      if (!isRiskError(e) || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  throw new Error('unreachable');
}

async function fetchPlaylistDetailWeapi(playlistId: string, signal?: AbortSignal): Promise<NetPlaylistDetail> {
  const detail = await callWeapi<{
    code: number;
    playlist?: {
      id: number;
      name: string;
      coverImgUrl?: string;
      description?: string;
      playCount?: number;
      trackCount?: number;
      creator?: { nickname?: string };
      trackIds?: { id: number }[];
    };
  }>(
    '/weapi/v3/playlist/detail',
    { id: playlistId, offset: 0, total: true, limit: 1000, n: 1000, csrf_token: '' },
    signal,
  );
  const pl = detail.playlist;
  if (!pl) throw codeError('netease playlist detail', detail.code);

  const ids = (pl.trackIds ?? []).slice(0, 300).map((t) => t.id);
  const tracks: MusicTrack[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const songs = await callWeapi<{ songs?: RawSong[] }>(
      '/weapi/v3/song/detail',
      {
        c: JSON.stringify(chunk.map((id) => ({ id }))),
        ids: JSON.stringify(chunk),
      },
      signal,
    );
    tracks.push(...(songs.songs ?? []).map(toTrack));
  }

  return {
    meta: {
      id: String(pl.id),
      name: pl.name,
      coverUrl: (pl.coverImgUrl || '') + '?param=400y400',
      playCount: pl.playCount ?? 0,
      trackCount: pl.trackCount ?? ids.length,
      description: pl.description ?? '',
      creator: pl.creator?.nickname ?? '',
    },
    tracks,
  };
}

/**
 * Legacy unencrypted channel (music.163.com/api/playlist/detail). Immune to
 * the weapi risk-control path; only covers the playlist-detail use case,
 * which is the one users hit most.
 * Transport: browser -> /api/netease/public relay (dev middleware / Vercel /
 * Cloudflare); packaged app -> straight through the Rust core (no CORS).
 */
async function getPlaylistDetailLegacy(playlistId: string, signal?: AbortSignal): Promise<NetPlaylistDetail> {
  let j: {
    code: number;
    result?: {
      id: number;
      name: string;
      coverImgUrl?: string;
      description?: string;
      playCount?: number;
      trackCount?: number;
      creator?: { nickname?: string };
      tracks?: RawSong[];
    };
  };
  if (isTauri()) {
    const res = await httpFetch(
      'https://music.163.com/api/playlist/detail?id=' + encodeURIComponent(playlistId) + '&n=1000',
      {
        headers: { Referer: 'https://music.163.com', Cookie: 'os=pc; appver=2.9.7; mode=31' },
        signal,
      },
    );
    if (!res.ok) throw new Error('netease legacy fallback HTTP ' + res.status);
    j = (await res.json()) as typeof j;
  } else {
    const qs = new URLSearchParams({ path: '/api/playlist/detail', id: playlistId, n: '1000' });
    const res = await fetch('/api/netease/public?' + qs, { signal });
    if (!res.ok) throw new Error('netease legacy fallback HTTP ' + res.status);
    j = (await res.json()) as typeof j;
  }
  if (j.code !== 200 || !j.result) throw codeError('netease legacy playlist detail', j.code);
  const tracks = (j.result.tracks ?? []).map(toTrackAny);
  if (!tracks.length) throw new Error('netease legacy fallback returned no tracks');
  return {
    meta: {
      id: String(j.result.id),
      name: j.result.name,
      coverUrl: (j.result.coverImgUrl || '') + '?param=400y400',
      playCount: j.result.playCount ?? 0,
      trackCount: j.result.trackCount ?? tracks.length,
      description: j.result.description ?? '',
      creator: j.result.creator?.nickname ?? '',
    },
    tracks,
  };
}

/** 新歌速递（官方发现页新音乐，真实数据）。 */
interface RawNewSong {
  id: number;
  name: string;
  duration?: number;
  artists?: { id?: number; name?: string }[];
  album?: { id?: number; name?: string; picUrl?: string; picId?: number | string };
}

export async function getNewSongs(signal?: AbortSignal): Promise<MusicTrack[]> {
  const r = await callWeapi<{ code: number; data?: RawNewSong[] }>(
    '/weapi/v1/discovery/new/songs',
    { areaId: 0, total: true },
    signal,
  );
  if (r.code !== 200 || !r.data) throw codeError('netease new songs', r.code);
  return r.data.slice(0, 50).map((s) => ({
    id: String(s.id),
    name: s.name,
    artist: (s.artists ?? []).map((a) => a.name ?? '').filter(Boolean),
    album: s.album?.name ?? '',
    pic_id: String(s.album?.picId ?? s.album?.id ?? s.id),
    url_id: String(s.id),
    lyric_id: String(s.id),
    source: 'netease',
    duration: Math.round((s.duration ?? 0) / 1000),
    picUrl: (s.album?.picUrl ?? '').replace(/^http:/, 'https:'),
  }));
}

export interface NetComment {
  nickname: string;
  avatarUrl: string;
  content: string;
  likedCount: number;
  time: number;
}

/** 歌曲热评（官方评论区，真实数据）。 */
export async function getHotComments(
  songId: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<NetComment[]> {
  const rid = 'R_SO_4_' + songId;
  const r = await callWeapi<{
    code: number;
    hotComments?: {
      user?: { nickname?: string; avatarUrl?: string };
      content?: string;
      likedCount?: number;
      time?: number;
    }[];
  }>(
    '/weapi/v1/resource/hotcomments/' + rid,
    { rid, limit, offset: 0, beforeTime: 0 },
    signal,
  );
  if (r.code !== 200) throw codeError('netease comments', r.code);
  return (r.hotComments ?? []).map((c) => ({
    nickname: c.user?.nickname ?? '',
    avatarUrl: (c.user?.avatarUrl ?? '') + '?param=80y80',
    content: c.content ?? '',
    likedCount: c.likedCount ?? 0,
    time: c.time ?? 0,
  }));
}

/** 官方搜索（cloudsearch）：结果自带专辑封面与时长，免去逐首解析封面。 */
export async function getNeteaseSearch(
  query: string,
  page: number,
  count: number,
  signal?: AbortSignal,
): Promise<{ items: MusicTrack[]; hasMore: boolean }> {
  const r = await callWeapi<{
    code: number;
    result?: { songs?: RawSong[]; songCount?: number };
  }>(
    '/weapi/cloudsearch/get/web',
    { s: query, type: 1, limit: count, offset: (page - 1) * count, csrf_token: '' },
    signal,
  );
  if (r.code !== 200) throw codeError('netease search', r.code);
  const songs = r.result?.songs ?? [];
  return { items: songs.map(toTrack), hasMore: songs.length === count };
}

export interface NetArtistMatch {
  id: string;
  name: string;
  coverUrl?: string;
}

export interface NetAlbumMatch {
  id: string;
  name: string;
  artist: string;
  coverUrl?: string;
}

export interface NetSearchMeta {
  artists: NetArtistMatch[];
  albums: NetAlbumMatch[];
}

/**
 * 多类型搜索：一次搜索建议调用同时返回相关歌手与专辑，
 * 让搜太阳之子想听专辑里的歌这类诉求有直接入口。
 * 走非加密的 legacy 通道（weapi 的 cloudsearch 对数据中心 IP 有 -462 风控）。
 */
export async function getNeteaseSearchMeta(
  query: string,
  signal?: AbortSignal,
): Promise<NetSearchMeta> {
  try {
    const j = await neteasePublicGet<{ result?: SuggestResult }>(
      '/api/search/suggest/web?s=' + encodeURIComponent(query) + '&limit=4',
      signal,
    );
    const r = j.result ?? {};
    const artists: NetArtistMatch[] = (r.artists ?? []).slice(0, 4).map((a) => ({
      id: String(a.id),
      name: a.name,
      coverUrl: a.picUrl || a.img1v1Url || undefined,
    }));
    const albums: NetAlbumMatch[] = (r.albums ?? []).slice(0, 4).map((a) => ({
      id: String(a.id),
      name: a.name,
      artist: a.artist?.name ?? '',
      coverUrl: a.picUrl || undefined,
    }));
    // The suggest endpoint strips album covers - pull each missing one from
    // the legacy album endpoint (risk control is probabilistic; retry twice).
    const noCover = albums.filter((a) => !a.coverUrl);
    if (noCover.length) {
      await Promise.allSettled(
        noCover.map(async (a) => {
          for (let i = 0; i < 3; i++) {
            try {
              const detail = await neteasePublicGet<{ album?: { picUrl?: string } }>('/api/album/' + a.id, signal);
              if (detail.album?.picUrl) {
                a.coverUrl = detail.album.picUrl + '?param=300y300';
                return;
              }
            } catch {
              /* probabilistic risk control - retry */
            }
            await new Promise((r2) => setTimeout(r2, 600));
          }
        }),
      );
    }
    return { artists, albums };
  } catch {
    return { artists: [], albums: [] };
  }
}

interface SuggestResult {
  artists?: { id: number; name: string; picUrl?: string; img1v1Url?: string }[];
  albums?: { id: number; name: string; picUrl?: string; artist?: { name?: string } }[];
}

export interface NetAlbumDetail {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  coverUrl?: string;
  description?: string;
  tracks: MusicTrack[];
}

/** 专辑详情（含全部曲目）。weapi 优先，被风控时回退 legacy 通道。 */
export async function getNeteaseAlbum(albumId: string, signal?: AbortSignal): Promise<NetAlbumDetail> {
  return withRiskRetry(async () => {
  const parse = (album: NonNullable<AlbumPayload['album']>): NetAlbumDetail => ({
    id: String(album.id),
    name: album.name,
    artist: album.artist?.name ?? '',
    artistId: album.artist?.id ? String(album.artist.id) : undefined,
    coverUrl: album.picUrl ? album.picUrl + '?param=400y400' : undefined,
    description: album.description ?? '',
    tracks: (album.songs ?? []).map(toTrackAny),
  });
  try {
    const r = await callWeapi<AlbumPayload>('/weapi/v1/album/' + albumId, { id: albumId, csrf_token: '' }, signal);
    if (r.album) {
      const parsed = parse(r.album);
      // Anonymous weapi calls often get the metadata with a STRIPPED track
      // list (code 200, songs: 0) - the legacy channel still serves songs.
      if (parsed.tracks.length) return parsed;
    }
    throw new Error('netease album empty');
  } catch (e) {
    const recoverable = isRiskError(e) || (e instanceof Error && e.message.includes('empty'));
    if (!recoverable || signal?.aborted) throw e;
    const j = await neteasePublicGet<AlbumPayload & { code: number }>('/api/album/' + albumId, signal);
    if (!j.album) throw codeError('netease album (legacy)', j.code);
    return parse(j.album);
  }
  });
}

interface AlbumPayload {
  code?: number;
  album?: {
    id: number;
    name: string;
    picUrl?: string;
    description?: string;
    artist?: { name?: string; id?: number };
    songs?: RawSong[];
  };
}

export interface NetArtistDetail {
  id: string;
  name: string;
  avatarUrl?: string;
  tracks: MusicTrack[];
}

/** 歌手热门歌曲。weapi 优先，被风控时回退 legacy 通道。 */
export async function getNeteaseArtist(artistId: string, signal?: AbortSignal): Promise<NetArtistDetail> {
  return withRiskRetry(async () => {
  const parse = (artist: NonNullable<ArtistPayload['artist']>, hotSongs: RawSong[] | undefined): NetArtistDetail => ({
    id: String(artist.id),
    name: artist.name,
    avatarUrl: artist.img1v1Url ? artist.img1v1Url + '?param=240y240' : undefined,
    tracks: (hotSongs ?? []).slice(0, 50).map(toTrackAny),
  });
  try {
    const r = await callWeapi<ArtistPayload>('/weapi/v1/artist/' + artistId, { id: artistId, csrf_token: '' }, signal);
    if (r.artist) {
      const parsed = parse(r.artist, r.hotSongs ?? []);
      // Anonymous weapi calls may strip hotSongs - fall back to legacy.
      if (parsed.tracks.length) return parsed;
    }
    throw new Error('netease artist empty');
  } catch (e) {
    const recoverable = isRiskError(e) || (e instanceof Error && e.message.includes('empty'));
    if (!recoverable || signal?.aborted) throw e;
    const j = await neteasePublicGet<ArtistPayload & { code: number }>('/api/artists/' + artistId, signal);
    if (!j.artist) throw codeError('netease artist (legacy)', j.code);
    return parse(j.artist, j.hotSongs ?? []);
  }
  });
}

interface ArtistPayload {
  code?: number;
  artist?: { id: number; name: string; img1v1Url?: string };
  hotSongs?: RawSong[];
}

