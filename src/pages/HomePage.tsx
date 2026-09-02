import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { NetPlaylistCard } from '@/components/NetPlaylistCard';
import { TrackListItem } from '@/components/TrackListItem';
import { TrackCover } from '@/components/TrackCover';
import { SectionHeader } from '@/design-system/components/SectionHeader';
import { Chip } from '@/design-system/components/Chip';
import { Skeleton } from '@/design-system/components/Skeleton';
import { EmptyState } from '@/design-system/components/EmptyState';
import { useSongs } from '@/music/musicStore';
import { useNeteaseRecommend } from '@/music/netease/useNetease';
import { getNewSongs } from '@/music/netease/netease-api';
import { songToTrack } from '@/music/source/types';
import type { MusicTrack } from '@/music/source/types';
import { useLibraryStore } from '@/store/useLibraryStore';
import { playerController } from '@/player';
import { fallbackPalette } from '@/utils/palette';
import { withAlpha } from '@/utils/color';
import './pages.css';

export function HomePage() {
  const navigate = useNavigate();
  const { data: netPlaylists, loading: netLoading, error: netError } = useNeteaseRecommend();

  const recentTracks = useLibraryStore((s) => s.recentTracks);
  const legacyRecentIds = useLibraryStore((s) => s.recentSongIds);
  const { data: legacySongs } = useSongs(recentTracks.length ? undefined : legacyRecentIds);

  const recents: MusicTrack[] = useMemo(
    () =>
      recentTracks.length
        ? recentTracks
        : (legacySongs ?? []).map(songToTrack),
    [recentTracks, legacySongs],
  );

  const [newSongs, setNewSongs] = useState<MusicTrack[] | null>(null);
  const [newSongsError, setNewSongsError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getNewSongs()
      .then((songs) => {
        if (alive) setNewSongs(songs);
      })
      .catch((e: unknown) => {
        if (alive) setNewSongsError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6) return '夜深了，听点安静的';
    if (h < 12) return '早上好，今天听点什么';
    if (h < 18) return '下午好，今天听点什么';
    return '晚上好，今天听点什么';
  })();

  const hotPlaylists = netPlaylists
    ? [...netPlaylists].sort((a, b) => b.playCount - a.playCount).slice(0, 4)
    : [];

  // Very subtle ambient tint from the latest listening history.
  const ambient = recents[0] ? recents[0].palette ?? fallbackPalette(recents[0].id) : null;

  return (
    <div className="page">
      {ambient ? (
        <div
          className="home-ambient"
          style={{
            background:
              'radial-gradient(95% 60% at 50% -12%, ' +
              withAlpha(ambient[0], 0.16) +
              ' 0%, ' +
              withAlpha(ambient[1], 0.06) +
              ' 52%, rgba(0,0,0,0) 100%)',
          }}
        />
      ) : null}

      <header className="home-hero">
        <div>
          <h1 className="home-hero__title">{greeting}</h1>
          <p className="home-hero__date">
            {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
        </div>
      </header>

      <button className="home-search" onClick={() => navigate('/search')}>
        <Icon name="search" size={19} />
        <span>搜索音乐</span>
      </button>

      <div className="home-shortcuts">
        <Chip onClick={() => navigate('/library')}>
          <span className="chip-inline">
            <Icon name="heart" size={14} /> 我喜欢
          </span>
        </Chip>
        <Chip onClick={() => navigate('/playlists')}>
          <span className="chip-inline">
            <Icon name="library" size={14} /> 歌单广场
          </span>
        </Chip>
        <Chip onClick={() => navigate('/discover')}>
          <span className="chip-inline">
            <Icon name="flame" size={14} /> 排行榜
          </span>
        </Chip>
        <Chip onClick={() => navigate('/ai')}>
          <span className="chip-inline">
            <Icon name="mic" size={14} /> 一起听
          </span>
        </Chip>
        <Chip
          onClick={() => {
            if (newSongs && newSongs.length) {
              const i = Math.floor(Math.random() * newSongs.length);
              playerController.playTracks(newSongs, i);
            }
          }}
        >
          <span className="chip-inline">
            <Icon name="shuffle" size={14} /> 随机新歌
          </span>
        </Chip>
      </div>

      {recents.length > 0 ? (
        <section>
          <SectionHeader title="最近播放" action="全部" onAction={() => navigate('/library')} />
          <div className="h-scroll">
            {recents.slice(0, 12).map((track) => (
              <button
                key={track.source + ':' + track.id}
                className="recent-card"
                onClick={() => playerController.playTrack(track, recents)}
              >
                <div className="recent-card__cover">
                  <TrackCover track={track} title={track.album || track.name} radius="var(--am-radius-lg)" />
                  <span className="recent-card__playbtn">
                    <Icon name="play" size={18} />
                  </span>
                </div>
                <div className="recent-card__title">{track.name}</div>
                <div className="recent-card__artist">{track.artist.join(' / ')}</div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader title="为你推荐" />
        {netLoading && !netPlaylists ? (
          <div className="grid-cards">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={180} radius="var(--am-radius-xl)" />
            ))}
          </div>
        ) : netError && !netPlaylists ? (
          <EmptyState icon="compass" title="在线歌单加载失败" description="真实歌单依赖 dev 代理，请确认通过 npm run dev 启动且网络可用" />
        ) : (
          <div className="grid-cards">
            {(netPlaylists ?? []).slice(0, 6).map((pl) => (
              <NetPlaylistCard key={pl.id} playlist={pl} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="热门歌单" action="歌单广场" onAction={() => navigate('/playlists')} />
        {hotPlaylists.length ? (
          <div className="grid-cards">
            {hotPlaylists.map((pl) => (
              <NetPlaylistCard key={pl.id} playlist={pl} />
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <SectionHeader title="新音乐 · 网易云官方新歌" />
        {!newSongs && !newSongsError ? (
          <div className="song-list">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={54} radius="var(--am-radius-lg)" />
            ))}
          </div>
        ) : newSongsError ? (
          <EmptyState icon="music" title="新歌加载失败" description={newSongsError} />
        ) : (
          <div className="song-list">
            {(newSongs ?? []).slice(0, 10).map((track) => (
              <TrackListItem key={track.id} track={track} context={newSongs ?? []} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
