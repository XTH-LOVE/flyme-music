import { playlistArt } from '@/utils/playlistArt';

interface PlaylistArtProps {
  name: string;
  seed: string;
  radius?: string;
  className?: string;
}

/**
 * Generative playlist cover: seeded gradient + one decorative geometry layer
 * + the playlist's initial. Pure CSS/SVG so it never taints a canvas.
 */
export function PlaylistArt({ name, seed, radius = '14px', className }: PlaylistArtProps) {
  const art = playlistArt(name, seed);
  const [a, b] = art.gradient;
  return (
    <div
      className={'playlist-art' + (className ? ' ' + className : '')}
      style={{
        borderRadius: radius,
        background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
      }}
      aria-label={'歌单封面：' + name}
      role="img"
    >
      <svg className="playlist-art__pattern" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {art.pattern === 0 ? (
          <>
            <circle cx="78" cy="24" r="34" fill="rgba(255,255,255,0.14)" />
            <circle cx="18" cy="82" r="22" fill="rgba(255,255,255,0.10)" />
          </>
        ) : art.pattern === 1 ? (
          <>
            <rect x="-20" y="58" width="150" height="12" fill="rgba(255,255,255,0.12)" transform="rotate(-24 50 64)" />
            <rect x="-20" y="78" width="150" height="12" fill="rgba(255,255,255,0.08)" transform="rotate(-24 50 84)" />
          </>
        ) : art.pattern === 2 ? (
          <>
            <path d="M-10 96 Q 50 30 110 90 L110 110 L-10 110 Z" fill="rgba(255,255,255,0.12)" />
            <path d="M-10 110 Q 60 52 110 104 L110 120 L-10 120 Z" fill="rgba(255,255,255,0.08)" />
          </>
        ) : (
          <>
            <rect x="56" y="-14" width="52" height="52" rx="10" fill="rgba(255,255,255,0.12)" transform="rotate(24 82 12)" />
            <rect x="-12" y="66" width="40" height="40" rx="8" fill="rgba(255,255,255,0.08)" transform="rotate(24 8 86)" />
          </>
        )}
      </svg>
      <span className="playlist-art__initial" aria-hidden="true">{art.initial}</span>
    </div>
  );
}
