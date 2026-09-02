import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { SongListItem } from '@/components/SongListItem';
import { Cover } from '@/design-system/components/Cover';
import { EmptyState } from '@/design-system/components/EmptyState';
import { useAlbum } from '@/music/musicStore';
import { playerController } from '@/player';
import './pages.css';
import { DetailSkeleton } from './PlaylistDetailPage';

export function AlbumDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading } = useAlbum(id);

  if (loading) return <DetailSkeleton />;
  if (!data) return <EmptyState title="专辑不存在" description="它可能已经被移除" />;

  const { album, songs } = data;

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="detail-hero__cover">
          <Cover palette={album.palette} title={album.title} radius="var(--am-radius-xl)" />
        </div>
        <div className="detail-hero__info">
          <div className="detail-hero__tag">专辑</div>
          <h1 className="detail-hero__title">{album.title}</h1>
          <button className="detail-hero__artist-link" onClick={() => navigate('/artist/' + album.artistId)}>
            {album.artistName}
          </button>
          <p className="detail-hero__desc">{album.description}</p>
          <p className="detail-hero__meta">{album.year} · {songs.length} 首</p>
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
        {songs.map((song, i) => (
          <SongListItem key={song.id} song={song} context={songs} index={i} showAlbum={false} />
        ))}
      </div>
    </div>
  );
}
