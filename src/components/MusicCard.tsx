import { useNavigate } from 'react-router-dom';
import { Cover } from '@/design-system/components/Cover';
import './components.css';

interface MusicCardProps {
  palette: [string, string];
  title: string;
  subtitle?: string;
  to?: string;
  onClick?: () => void;
}

/** Vertical media card used for playlists & albums. */
export function MusicCard({ palette, title, subtitle, to, onClick }: MusicCardProps) {
  const navigate = useNavigate();
  return (
    <button
      className="music-card"
      onClick={() => {
        if (to) navigate(to);
        onClick?.();
      }}
    >
      <div className="music-card__cover">
        <Cover palette={palette} title={title} radius="var(--am-radius-xl)" />
      </div>
      <div className="music-card__title">{title}</div>
      {subtitle ? <div className="music-card__subtitle">{subtitle}</div> : null}
    </button>
  );
}
