import { useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { MusicCard } from '@/components/MusicCard';
import { SongListItem } from '@/components/SongListItem';
import { Cover } from '@/design-system/components/Cover';
import { SectionHeader } from '@/design-system/components/SectionHeader';
import { EmptyState } from '@/design-system/components/EmptyState';
import { useArtist } from '@/music/musicStore';
import { playerController } from '@/player';
import { formatPlays } from '@/utils/format';
import './pages.css';
import { DetailSkeleton } from './PlaylistDetailPage';

export function ArtistDetailPage() {
  const { id } = useParams();
  const { data, loading } = useArtist(id);

  if (loading) return <DetailSkeleton />;
  if (!data) return <EmptyState title="艺术家不存在" description="它可能已经被移除" />;

  const { artist, hotSongs, albums } = data;

  return (
    <div className="page">
      <div className="artist-hero">
        <div className="artist-hero__avatar">
          <Cover palette={artist.palette} bare radius="50%" />
        </div>
        <div className="artist-hero__info">
          <h1 className="artist-hero__name">{artist.name}</h1>
          <p className="artist-hero__followers">{formatPlays(artist.followers)} 位关注者</p>
          <p className="artist-hero__bio">{artist.bio}</p>
          <div className="detail-hero__actions">
            <button className="am-btn am-btn--primary am-btn--md" onClick={() => playerController.playQueue(hotSongs, 0)}>
              <Icon name="play" size={16} />
              播放热门
            </button>
          </div>
        </div>
      </div>

      <SectionHeader title="热门歌曲" />
      <div className="song-list">
        {hotSongs.map((song, i) => (
          <SongListItem key={song.id} song={song} context={hotSongs} index={i} />
        ))}
      </div>

      {albums.length ? (
        <>
          <SectionHeader title="专辑" />
          <div className="grid-cards">
            {albums.map((al) => (
              <MusicCard key={al.id} palette={al.palette} title={al.title} subtitle={String(al.year)} to={'/album/' + al.id} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
