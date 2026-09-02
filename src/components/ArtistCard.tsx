import { useNavigate } from 'react-router-dom';
import { Cover } from '@/design-system/components/Cover';
import type { Artist } from '@/music/types';
import './components.css';

export function ArtistCard({ artist }: { artist: Artist }) {
  const navigate = useNavigate();
  return (
    <button className="artist-card" onClick={() => navigate('/artist/' + artist.id)}>
      <div className="artist-card__avatar">
        <Cover palette={artist.palette} bare radius="50%" />
      </div>
      <div className="artist-card__name">{artist.name}</div>
    </button>
  );
}
