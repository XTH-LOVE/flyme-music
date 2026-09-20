import { useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { SongListItem } from '@/components/SongListItem';
import { ProgressiveList } from '@/components/ProgressiveList';
import { Cover } from '@/design-system/components/Cover';
import { EmptyState } from '@/design-system/components/EmptyState';
import { Skeleton } from '@/design-system/components/Skeleton';
import { usePlaylist } from '@/music/musicStore';
import { playerController } from '@/player';
import { formatPlays } from '@/utils/format';
import './pages.css';

export function PlaylistDetailPage() {
  const { id } = useParams();
  const { data, loading } = usePlaylist(id);

  if (loading) return <DetailSkeleton />;
  if (!data) return <EmptyState title="歌单不存在" description="它可能已经被移除" />;

  const { playlist, songs } = data;

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="detail-hero__cover">
          <Cover palette={playlist.palette} title={playlist.title} radius="var(--am-radius-xl)" />
        </div>
        <div className="detail-hero__info">
          <div className="detail-hero__tag">歌单</div>
          <h1 className="detail-hero__title">{playlist.title}</h1>
          <p className="detail-hero__desc">{playlist.description}</p>
          <p className="detail-hero__meta">{songs.length} 首 · {formatPlays(playlist.plays)} 次播放</p>
          <div className="detail-hero__actions">
            <button className="am-btn am-btn--primary am-btn--md" onClick={() => playerController.playQueue(songs, 0)}>
              <Icon name="play" size={16} />
              播放全部
            </button>
            <button className="am-btn am-btn--secondary am-btn--md" onClick={() => playerController.playQueue(songs, Math.floor(Math.random() * songs.length))}>
              <Icon name="shuffle" size={16} />
              随机
            </button>
          </div>
        </div>
      </div>
      <div className="song-list">
        <ProgressiveList
          items={songs}
          resetKey={id}
          renderItem={(song, i) => (
            <SongListItem key={song.id} song={song} context={songs} index={i} />
          )}
        />
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="page">
      <div className="detail-hero">
        <Skeleton width={180} height={180} radius="var(--am-radius-xl)" />
        <div className="detail-hero__info">
          <Skeleton width={80} height={14} />
          <Skeleton width={200} height={26} className="mt8" />
          <Skeleton width={260} height={14} className="mt8" />
        </div>
      </div>
      <Skeleton width="100%" height={240} radius="var(--am-radius-xl)" />
    </div>
  );
}
