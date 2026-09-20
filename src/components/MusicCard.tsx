import { useNavigate } from 'react-router-dom';
import { Cover } from '@/design-system/components/Cover';
import { usePressGlow } from '@/hooks/usePressGlow';
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
  const pressGlow = usePressGlow();
  return (
    <button
      className="music-card"
      onClick={() => {
        if (to) navigate(to);
        onClick?.();
      }}
    >
      {/* The glow rides on the cover, not the whole button: the artwork is
          opaque, so a highlight behind it would never be seen. */}
      <div
        className="music-card__cover press-glow press-glow--over"
        onPointerDown={pressGlow}
      >
        <Cover palette={palette} title={title} radius="var(--am-radius-xl)" />
      </div>
      <div className="music-card__title">{title}</div>
      {subtitle ? <div className="music-card__subtitle">{subtitle}</div> : null}
    </button>
  );
}
