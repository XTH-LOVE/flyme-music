import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/design-system/components/IconButton';
import { TrackCover } from '@/components/TrackCover';
import { playerController } from '@/player';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useCrossfadeStack } from '@/hooks/useCrossfadeStack';
import { fetchLyricLines, lyricLineAt, type MiniLyricLine } from '@/utils/currentLyric';
import type { MusicTrack } from '@/music/source/types';
import './components.css';
import './mini-glass.css';

function MiniCoverSwap({ track }: { track: MusicTrack }) {
  const stack = useCrossfadeStack(track);

  return (
    <>
      {stack.map((t, i) => (
        <div
          key={t.source + ':' + t.id}
          className={
            'mini-cover-swap__layer' + (i === stack.length - 1 ? ' mini-cover-swap__layer--top' : '')
          }
        >
          <TrackCover track={t} bare radius="50%" />
        </div>
      ))}
    </>
  );
}

/** Halcyon-style liquid glass mini player pill. */
export function MiniPlayer() {
  const current = usePlayerStore((s) => s.current);
  const status = usePlayerStore((s) => s.status);
  const simulated = usePlayerStore((s) => s.simulated);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const openFullPlayer = usePlayerStore((s) => s.openFullPlayer);
  const favorites = useLibraryStore((s) => s.favoriteSongIds);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const [lyric, setLyric] = useState('');
  const linesRef = useRef<MiniLyricLine[]>([]);
  const [dragX, setDragX] = useState(0);
  const dragRef = useRef({ startX: 0, dx: 0, active: false });

  useEffect(() => {
    if (!current) return;
    linesRef.current = [];
    setLyric('');
    let alive = true;
    void fetchLyricLines(current).then((lines) => {
      if (alive) linesRef.current = lines;
    });
    return () => {
      alive = false;
    };
    // Narrowed to the track identity on purpose: `current` is a new object on
    // every player-store update (e.g. every position tick), so depending on it
    // would refetch the lyrics continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [current?.id, current?.source]);

  useEffect(() => {
    const line = lyricLineAt(linesRef.current, currentTime);
    if (line) setLyric(line.text);
  }, [currentTime]);

  if (!current) return null;

  const playing = status === 'playing';
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const fav = favorites.includes(current.id);
  const accent = 'var(--am-accent, #3D7BFF)';

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = e.target;
    // Buttons keep native click: never let the swipe gesture capture them.
    if (t instanceof Element && t.closest('.mini-glass__controls')) return;
    dragRef.current = { startX: e.clientX, dx: 0, active: true };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    dragRef.current.dx = dx;
    setDragX(Math.max(-80, Math.min(80, dx * 0.5)));
  };
  const onPointerUp = () => {
    if (!dragRef.current.active) return;
    const dx = dragRef.current.dx;
    dragRef.current.active = false;
    setDragX(0);
    if (dx <= -60) playerController.next();
    else if (dx >= 60) playerController.previous();
  };

  return (
    <div
      className={'mini-player' + (playing ? ' mini-player--playing' : '')}
      onWheel={(e) => {
        // Desktop habit: scroll over the pill to adjust volume.
        playerController.setVolume(Math.min(1, Math.max(0, volume + (e.deltaY < 0 ? 0.05 : -0.05))));
      }}
    >
      <div
        className="mini-glass"
        onClick={openFullPlayer}
        style={dragX ? { transform: 'translateX(' + dragX + 'px)' } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="mini-glass__ring"
          style={{
            background:
              'conic-gradient(' + accent + ' ' + progress + '%, rgba(255,255,255,0.16) 0)',
          }}
        >
          <div className="mini-glass__cover">
            <MiniCoverSwap track={current} />
          </div>
        </div>
        <div className="mini-glass__text">
          <div className="mini-glass__title">
            {current.name}
            {playing && simulated && current.source === 'mock' ? <span className="am-sim-badge">离线试听</span> : null}
          </div>
          <div className="mini-glass__sub">
            {lyric || current.artist.join(' / ') || '未在播放'}
          </div>
        </div>
        <div className="mini-glass__controls" onClick={(e) => e.stopPropagation()}>
          <IconButton
            size="sm"
            accent={fav}
            label={fav ? '取消喜欢' : '喜欢'}
            onClick={() => toggleFavorite(current.id)}
          >
            <Icon name={fav ? 'heartFill' : 'heart'} size={18} />
          </IconButton>
          <IconButton label={playing ? '暂停' : '播放'} onClick={() => playerController.toggle()}>
            <Icon name={playing ? 'pause' : 'play'} size={22} />
          </IconButton>
          <IconButton label="下一首" onClick={() => playerController.next()}>
            <Icon name="next" size={20} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
