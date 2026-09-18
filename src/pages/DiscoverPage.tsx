import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { NetPlaylistCard } from '@/components/NetPlaylistCard';
import { TrackListItem } from '@/components/TrackListItem';
import { SectionHeader } from '@/design-system/components/SectionHeader';
import { Chip } from '@/design-system/components/Chip';
import { Skeleton } from '@/design-system/components/Skeleton';
import { EmptyState } from '@/design-system/components/EmptyState';
import { useNeteaseRecommend } from '@/music/netease/useNetease';
import { getNewSongs } from '@/music/netease/netease-api';
import type { MusicTrack } from '@/music/source/types';
import { sourceLabels } from '@/music/source/types';
import { useDailyPick } from '@/hooks/useDailyPick';
import { playerController } from '@/player';
import './pages.css';
import './discover-extra.css';

/** 网易云官方榜单（真实歌单，可直接打开播放）。 */
const OFFICIAL_CHARTS: { id: string; name: string; desc: string; palette: [string, string] }[] = [
  { id: '19723756', name: '云音乐飙升榜', desc: '飙升最快的歌曲', palette: ['#FF6A5A', '#FFB0A0'] },
  { id: '3778678', name: '云音乐热歌榜', desc: '全站最热歌曲', palette: ['#F2A65A', '#FFD8A0'] },
  { id: '3779629', name: '云音乐新歌榜', desc: '新发行热度歌曲', palette: ['#3D7BFF', '#9CB8FF'] },
];

const genres = ['流行', '民谣', '电子', '摇滚', '说唱', '古风', '轻音乐', 'ACG'];

export function DiscoverPage() {
  const navigate = useNavigate();
  const { data: netPlaylists, loading: netLoading } = useNeteaseRecommend();
  const dailyPick = useDailyPick();
  const [newSongs, setNewSongs] = useState<MusicTrack[] | null>(null);
  const [newSongsAttempt, setNewSongsAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getNewSongs()
      .then((songs) => {
        if (alive) setNewSongs(songs);
      })
      .catch(() => {
        if (alive) setNewSongs([]);
      });
    return () => {
      alive = false;
    };
  }, [newSongsAttempt]);

  const banners = netPlaylists
    ? [...netPlaylists].sort((a, b) => b.playCount - a.playCount).slice(0, 2)
    : [];

  return (
    <div className="page">
      <h1 className="page-title">发现</h1>

      <section>
        <SectionHeader
          title={'每日推荐' + (dailyPick.sourceNames.length ? ' · ' + dailyPick.sourceNames.map((s) => sourceLabels[s]).join('/') : '')}
          action={dailyPick.available ? '播放全部' : undefined}
          onAction={dailyPick.available ? () => playerController.playTracks(dailyPick.tracks) : undefined}
        />
        {dailyPick.loading && !dailyPick.tracks.length ? (
          <div className="song-list">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={54} radius="var(--am-radius-lg)" />
            ))}
          </div>
        ) : dailyPick.tracks.length ? (
          <div className="song-list">
            {dailyPick.tracks.slice(0, 10).map((track) => (
              <TrackListItem key={track.source + ':' + track.id} track={track} context={dailyPick.tracks} />
            ))}
          </div>
        ) : (
          <EmptyState icon="compass" title="还没有为你推荐" description="多听几首歌，Aurora 就会根据你的口味生成每日推荐" />
        )}
      </section>

      <section className="banner-row">
        {netLoading && !netPlaylists
          ? [0, 1].map((i) => <Skeleton key={i} height={120} radius="var(--am-radius-xl)" />)
          : banners.map((pl) => (
              <button key={pl.id} className="banner banner--net" onClick={() => navigate('/ne-playlist/' + pl.id)}>
                <div className="banner__text">
                  <div className="banner__tag">网易云 · 真实歌单</div>
                  <div className="banner__title">{pl.name}</div>
                  <div className="banner__desc">{pl.description || pl.trackCount + ' 首歌曲'}</div>
                </div>
                {pl.coverUrl ? <img className="net-banner-cover" src={pl.coverUrl} alt={pl.name} loading="lazy" /> : null}
              </button>
            ))}
      </section>

      <section>
        <SectionHeader title="排行榜 · 网易云官方" />
        <div className="chart-grid">
          {OFFICIAL_CHARTS.map((chart) => (
            <button
              key={chart.id}
              className="chart-card chart-card--link"
              style={{
                background:
                  'radial-gradient(130% 100% at 10% 0%, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 55%), linear-gradient(150deg, ' +
                  chart.palette[0] +
                  ', ' +
                  chart.palette[1] +
                  ')',
              }}
              onClick={() => navigate('/ne-playlist/' + chart.id)}
            >
              <div className="chart-card__head">
                <div>
                  <div className="chart-card__title">{chart.name}</div>
                  <div className="chart-card__subtitle">{chart.desc} · 官方实时更新</div>
                </div>
                <span className="chart-card__play">
                  <Icon name="chevronRight" size={16} />
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="新歌 · 官方新歌速递" />
        {!newSongs ? (
          <div className="song-list">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={54} radius="var(--am-radius-lg)" />
            ))}
          </div>
        ) : newSongs.length === 0 ? (
          <EmptyState icon="music" title="新歌加载失败" description="请检查网络后重试" action={{ label: '重试', onClick: () => setNewSongsAttempt((n) => n + 1) }} />
        ) : (
          <div className="song-list">
            {newSongs.slice(0, 8).map((track) => (
              <TrackListItem key={track.id} track={track} context={newSongs} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="歌单分类" action="歌单广场" onAction={() => navigate('/playlists')} />
        <div className="chip-row chip-row--wrap">
          {genres.map((g) => (
            <Chip key={g} onClick={() => navigate('/playlists?cat=' + encodeURIComponent(g))}>
              {g}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="推荐歌单" />
        {netPlaylists ? (
          <div className="grid-cards">
            {netPlaylists.slice(6, 12).map((pl) => (
              <NetPlaylistCard key={pl.id} playlist={pl} />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
