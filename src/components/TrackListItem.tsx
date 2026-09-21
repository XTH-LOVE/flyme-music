import { memo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/design-system/components/IconButton';
import { TrackCover } from '@/components/TrackCover';
import { SourceBadge } from '@/components/SourceBadge';
import { TrackActionsSheet } from '@/components/TrackActionsSheet';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { usePressGlow } from '@/hooks/usePressGlow';
import { playerController } from '@/player';
import type { MusicTrack } from '@/music/source/types';
import { formatTime } from '@/utils/format';
import './source.css';

interface TrackListItemProps {
  track: MusicTrack;
  context: MusicTrack[];
  index?: number;
  onRemove?: () => void;
}

/**
 * Memoized because the pages that render it in bulk re-render on every state
 * change - including each progressive reveal, which would otherwise re-run
 * hundreds of already-correct rows. Props are a track from a stable array, that
 * same array, and an index, so the comparison is genuinely cheap.
 */
export const TrackListItem = memo(function TrackListItem({ track, context, index, onRemove }: TrackListItemProps) {
  const current = usePlayerStore((s) => s.current);
  const isPlaying = usePlayerStore((s) => s.status === 'playing');
  const favorites = useLibraryStore((s) => s.favoriteSongIds);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const [actionsOpen, setActionsOpen] = useState(false);
  const pressGlow = usePressGlow();

  const active = current?.id === track.id && current?.source === track.source;
  const fav = favorites.includes(track.id);

  // Long-press (mobile habit) opens the actions sheet; the following click
  // that closes the gesture is suppressed so it never also starts playback.
  const longPress = useRef<{ timer: number | null; fired: boolean }>({ timer: null, fired: false });
  const clearLongPress = () => {
    if (longPress.current.timer !== null) window.clearTimeout(longPress.current.timer);
    longPress.current.timer = null;
  };
  const onRowPointerDown = (e: React.PointerEvent) => {
    pressGlow(e);
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    clearLongPress();
    longPress.current.fired = false;
    longPress.current.timer = window.setTimeout(() => {
      longPress.current.timer = null;
      longPress.current.fired = true;
      setActionsOpen(true);
    }, 480);
  };
  const onRowClick = () => {
    if (longPress.current.fired) {
      longPress.current.fired = false;
      return;
    }
    playerController.playTrack(track, context);
  };

  return (
    <>
      <div
        className={'song-item press-glow' + (active ? ' song-item--active' : '')}
        role="button"
        tabIndex={0}
        // Lets a page scroll to a specific row (index-bar jumps, "locate the
        // playing song") without depending on class-based DOM ordering.
        data-row-index={typeof index === 'number' ? index : undefined}
        aria-label={'播放 ' + track.name + ' - ' + track.artist.join(' / ')}
        onClick={onRowClick}
        onPointerDown={onRowPointerDown}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onPointerCancel={clearLongPress}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            playerController.playTrack(track, context);
          }
        }}
      >
        {typeof index === 'number' ? <span className="song-item__index">{index + 1}</span> : null}
        <div className="song-item__cover">
          <TrackCover track={track} bare radius="var(--am-radius-sm)" />
          {active ? (
            <div className={'song-item__eq' + (isPlaying ? ' song-item__eq--on' : '')}>
              <span />
              <span />
              <span />
            </div>
          ) : null}
        </div>
        <div className="song-item__body">
          <div className="song-item__title">
            {track.name}
            <SourceBadge source={track.source} />
          </div>
          <div className="song-item__meta">
            {track.artist.join(' / ')}
            {track.album ? ' · ' + track.album : ''}
          </div>
        </div>
        <div className="song-item__duration">
          {track.duration ? formatTime(track.duration) : '--:--'}
        </div>
        <IconButton
          size="sm"
          accent={fav}
          label={fav ? '取消喜欢' : '喜欢'}
          onClick={() => toggleFavorite(track)}
        >
          <Icon name={fav ? 'heartFill' : 'heart'} size={17} />
        </IconButton>
        {onRemove ? (
          <IconButton size="sm" label="从歌单移除" onClick={onRemove}>
            <Icon name="trash" size={16} />
          </IconButton>
        ) : (
          <IconButton size="sm" label="更多操作" onClick={() => setActionsOpen(true)}>
            <Icon name="more" size={17} />
          </IconButton>
        )}
      </div>
      <TrackActionsSheet open={actionsOpen} track={track} onClose={() => setActionsOpen(false)} />
    </>
  );
});
