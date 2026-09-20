import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { LocatableTrackList } from '@/components/LocatableTrackList';
import { ExpandableText } from '@/components/ExpandableText';
import { EmptyState } from '@/design-system/components/EmptyState';
import { Skeleton } from '@/design-system/components/Skeleton';
import { useNeteaseAlbum } from '@/music/netease/useNetease';
import { playerController } from '@/player';
import './pages.css';

/** 真实网易云专辑详情：全部曲目可直接播放。 */
export function NeteaseAlbumDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useNeteaseAlbum(id);

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
    return <EmptyState title="专辑加载失败" description={error ?? '请检查网络后重试'} action={{ label: '重试', onClick: reload }} />;
  }

  const { name, artist, artistId, coverUrl, description, tracks } = data;

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="detail-hero__cover">
          <div className="detail-hero__cover-fallback" aria-hidden="true">
            <Icon name="album" size={42} />
          </div>
          {coverUrl ? <img src={coverUrl} alt={name} /> : null}
        </div>
        <div className="detail-hero__info">
          <div className="detail-hero__tag">网易云专辑</div>
          <h1 className="detail-hero__title">{name}</h1>
          {artist ? (
            artistId ? (
              <button className="detail-hero__artist-link" onClick={() => navigate('/ne-artist/' + artistId)}>
                {artist}
              </button>
            ) : (
              <p className="detail-hero__meta">{artist}</p>
            )
          ) : null}
          {description ? <ExpandableText className="detail-hero__desc" text={description} /> : null}
          <p className="detail-hero__meta">{tracks.length} 首</p>
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
      <LocatableTrackList tracks={tracks} resetKey={id} />
    </div>
  );
}
