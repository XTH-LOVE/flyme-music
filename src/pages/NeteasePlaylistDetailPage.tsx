import { useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { TrackListItem } from '@/components/TrackListItem';
import { ProxyImg } from '@/components/ProxyImg';
import { EmptyState } from '@/design-system/components/EmptyState';
import { Skeleton } from '@/design-system/components/Skeleton';
import { useNeteasePlaylistDetail } from '@/music/netease/useNetease';
import { playerController } from '@/player';
import { formatPlays } from '@/utils/format';
import './pages.css';

/** Real Netease playlist detail - online tracks, directly playable. */
export function NeteasePlaylistDetailPage() {
  const { id } = useParams();
  const { data, loading, error } = useNeteasePlaylistDetail(id);

  if (loading) {
    return (
      <div className="page">
        <div className="detail-hero">
          <Skeleton width={180} height={180} radius="var(--am-radius-xl)" />
          <div className="detail-hero__info">
            <Skeleton width={220} height={26} />
            <Skeleton width={280} height={14} className="mt8" />
          </div>
        </div>
        <Skeleton width="100%" height={280} radius="var(--am-radius-xl)" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        title="歌单加载失败"
        description={error ?? '请检查网络后重试（真实歌单需要 dev 代理在线）'}
      />
    );
  }

  const { meta, tracks } = data;

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="detail-hero__cover">
          <div className="detail-hero__cover-fallback" aria-hidden="true">
            <Icon name="music" size={42} />
          </div>
          {meta.coverUrl ? (
            <ProxyImg src={meta.coverUrl.replace('400y400', '600y600')} alt={meta.name} />
          ) : null}
        </div>
        <div className="detail-hero__info">
          <div className="detail-hero__tag">网易云歌单</div>
          <h1 className="detail-hero__title">{meta.name}</h1>
          {meta.creator ? <p className="detail-hero__meta">by {meta.creator}</p> : null}
          {meta.description ? <p className="detail-hero__desc">{meta.description}</p> : null}
          <p className="detail-hero__meta">
            {tracks.length} 首 · {formatPlays(meta.playCount)} 次播放
          </p>
          <div className="detail-hero__actions">
            <button
              className="am-btn am-btn--primary am-btn--md"
              disabled={!tracks.length}
              onClick={() => playerController.playTracks(tracks, 0)}
            >
              <Icon name="play" size={16} />
              播放全部
            </button>
            <button
              className="am-btn am-btn--secondary am-btn--md"
              disabled={!tracks.length}
              onClick={() => playerController.playTracks(tracks, Math.floor(Math.random() * tracks.length))}
            >
              <Icon name="shuffle" size={16} />
              随机
            </button>
          </div>
        </div>
      </div>
      <div className="song-list">
        {tracks.map((track, i) => (
          <TrackListItem key={track.id + ':' + i} track={track} context={tracks} index={i} />
        ))}
      </div>
    </div>
  );
}
