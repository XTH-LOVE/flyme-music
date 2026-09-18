import { useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { TrackListItem } from '@/components/TrackListItem';
import { EmptyState } from '@/design-system/components/EmptyState';
import { Skeleton } from '@/design-system/components/Skeleton';
import { useNeteaseArtist } from '@/music/netease/useNetease';
import { playerController } from '@/player';
import './pages.css';

/** 真实网易云歌手页：热门歌曲排行（可直接播放）。 */
export function NeteaseArtistDetailPage() {
  const { id } = useParams();
  const { data, loading, error, reload } = useNeteaseArtist(id);

  if (loading) {
    return (
      <div className="page">
        <div className="detail-hero">
          <Skeleton width={176} height={176} radius="var(--am-radius-xl)" />
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
    return <EmptyState title="歌手加载失败" description={error ?? '请检查网络后重试'} action={{ label: '重试', onClick: reload }} />;
  }

  const { name, avatarUrl, tracks } = data;

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="detail-hero__cover">
          <div className="detail-hero__cover-fallback" aria-hidden="true">
            <Icon name="user" size={42} />
          </div>
          {avatarUrl ? <img src={avatarUrl} alt={name} /> : null}
        </div>
        <div className="detail-hero__info">
          <div className="detail-hero__tag">网易云歌手</div>
          <h1 className="detail-hero__title">{name}</h1>
          <p className="detail-hero__meta">热门 {tracks.length} 首</p>
          <div className="detail-hero__actions">
            <button
              className="am-btn am-btn--primary am-btn--md"
              disabled={!tracks.length}
              onClick={() => playerController.playTracks(tracks, 0)}
            >
              <Icon name="play" size={16} />
              播放热门
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
