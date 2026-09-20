import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/design-system/components/IconButton';
import { TrackCover } from '@/components/TrackCover';
import { BottomSheet } from '@/design-system/components/BottomSheet';
import { playerController } from '@/player';
import { usePlayerStore } from '@/store/usePlayerStore';
import { formatTime } from '@/utils/format';
import { dragShift, dropTarget, gapAt, type SlotGeometry } from '@/utils/queueDrag';
import './fullplayer.css';
import './drawer.css';

interface QueueSheetProps {
  open: boolean;
  onClose: () => void;
}

interface DragState {
  pointerId: number;
  /** Row index within the up-next slice. */
  from: number;
  /** Gap the pointer is currently over, 0..count. */
  gap: number;
  /** Pointer offset of the dragged row, in row units. */
  dragged: number;
  /** Measured once at drag start; rows cannot change size mid-drag. */
  rowHeight: number;
}

/**
 * Queue drawer: reorder, remove, clear.
 *
 * Reordering is pointer-driven rather than HTML5 drag-and-drop, which never
 * fires on a touch screen - the previous version was desktop-only, with up/down
 * buttons as the only option on a phone. The up/down buttons stay anyway: they
 * are the accessible path, and a keyboard user cannot drag.
 *
 * Every row of the auto queue is draggable. Halcyon restricts this to entries
 * the user added by hand, but its auto queue is *derived* from the source list
 * and regenerates, so reordering it would be meaningless. Flyme's queue is a
 * plain array that stays put, so the restriction would only take away a
 * capability the user already has.
 */
export function QueueSheet({ open, onClose }: QueueSheetProps) {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const status = usePlayerStore((s) => s.status);
  const rowsRef = useRef<HTMLDivElement>(null);
  const origin = useRef<{ y: number; geometry: SlotGeometry } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const nowPlaying = queue[queueIndex];
  const upNext = queue.slice(queueIndex + 1);
  const shifts = drag ? dragShift(drag.from, drag.gap, upNext.length, drag.dragged) : null;
  const target = drag ? dropTarget(drag.from, drag.gap, upNext.length) : -1;

  /**
   * Row height and list origin, measured once when a drag starts.
   *
   * Measured rather than assumed: the row height is set by its 42px cover plus
   * padding, and the sheet's own scroll position means the origin cannot be a
   * constant. Nothing moves during a drag - the handle claims the gesture - so
   * one reading is enough.
   */
  const measure = (): SlotGeometry | null => {
    const el = rowsRef.current;
    const first = el?.querySelector<HTMLElement>('.queue-item');
    if (!el || !first) return null;
    const rowHeight = first.getBoundingClientRect().height;
    if (!(rowHeight > 0)) return null;
    return { top: el.getBoundingClientRect().top, rowHeight, count: upNext.length };
  };

  const startDrag = (e: React.PointerEvent<HTMLElement>, from: number) => {
    const geometry = measure();
    if (!geometry) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    origin.current = { y: e.clientY, geometry };
    setDrag({
      pointerId: e.pointerId,
      from,
      gap: from,
      dragged: 0,
      rowHeight: geometry.rowHeight,
    });
  };

  const moveDrag = (e: React.PointerEvent<HTMLElement>) => {
    const anchor = origin.current;
    if (!drag || !anchor || e.pointerId !== drag.pointerId) return;
    const dragged = (e.clientY - anchor.y) / anchor.geometry.rowHeight;
    const gap = gapAt(e.clientY, anchor.geometry);
    // Bail out when nothing changed: this runs on every pointermove.
    if (dragged === drag.dragged && gap === drag.gap) return;
    setDrag({ ...drag, dragged, gap });
  };

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const to = dropTarget(drag.from, drag.gap, upNext.length);
    if (to !== drag.from) {
      playerController.moveQueueItem(queueIndex + 1 + drag.from, queueIndex + 1 + to);
    }
    origin.current = null;
    setDrag(null);
  };
  return (
    <BottomSheet
      open={open}
      title={'播放队列 · ' + queue.length + ' 首'}
      onClose={onClose}
      variant="drawer"
    >
      <div className="queue-list" onClick={(e) => e.stopPropagation()}>
        {nowPlaying ? (
          <>
            <div className="queue-section-title">正在播放</div>
            <div className="queue-now">
              <div className="queue-item__cover">
                <TrackCover track={nowPlaying} bare radius="var(--am-radius-sm)" priority />
              </div>
              <div className="queue-item__body">
                <div className="queue-now__title">{nowPlaying.name}</div>
                <div className="queue-now__meta">{nowPlaying.artist.join(' / ')}</div>
              </div>
              {status === 'playing' ? (
                <div className="queue-eq">
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {upNext.length ? (
          <>
            <div className="queue-section-head">
              <div className="queue-section-title">接下来播放</div>
              {/* Only the pending songs: this button sits under 接下来播放, so
                  clearing the whole queue would also stop the current track. */}
              <button className="queue-clear" onClick={() => playerController.clearUpNext()}>
                <Icon name="trash" size={14} />
                清空待播
              </button>
            </div>
            <div className={'queue-rows' + (drag ? ' queue-rows--dragging' : '')} ref={rowsRef}>
              {upNext.map((track, i) => {
                const realIndex = queueIndex + 1 + i;
                const shift = shifts ? shifts[i] : 0;
                const lifted = drag?.from === i;
                return (
                  <div
                    key={track.source + ':' + track.id + '-' + realIndex}
                    className={'queue-item' + (lifted ? ' queue-item--dragging' : '')}
                    style={
                      shift ? { transform: 'translateY(' + shift * (drag?.rowHeight ?? 0) + 'px)' } : undefined
                    }
                    role="button"
                    tabIndex={0}
                    aria-label={'播放 ' + track.name + ' - ' + track.artist.join(' / ')}
                    onClick={() => {
                      if (drag) return;
                      playerController.jumpToQueueIndex(realIndex);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        playerController.jumpToQueueIndex(realIndex);
                      }
                    }}
                  >
                    <span
                      className="queue-handle"
                      aria-hidden="true"
                      onPointerDown={(e) => startDrag(e, i)}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Icon name="grip" size={17} />
                    </span>
                    <div className="queue-item__cover">
                      <TrackCover track={track} bare radius="var(--am-radius-sm)" />
                    </div>
                    <div className="queue-item__body">
                      <div className="queue-item__title">{track.name}</div>
                      <div className="queue-item__meta">{track.artist.join(' / ')}</div>
                    </div>
                    <span className="queue-item__duration">
                      {track.duration ? formatTime(track.duration) : '--:--'}
                    </span>
                    <div className="queue-item__ops" onClick={(e) => e.stopPropagation()}>
                      <IconButton
                        size="sm"
                        label={i === 0 ? '已是最靠前的一首' : '上移'}
                        // The first pending song sits directly after the playing
                        // one; moving it "up" would put it behind the playhead,
                        // where sequential playback would never reach it again.
                        disabled={i === 0}
                        onClick={() => playerController.moveQueueItem(realIndex, realIndex - 1)}
                      >
                        <Icon name="chevronLeft" size={15} className="queue-up" />
                      </IconButton>
                      <IconButton
                        size="sm"
                        label={i === upNext.length - 1 ? '已是最后一首' : '下移'}
                        disabled={i === upNext.length - 1}
                        onClick={() => playerController.moveQueueItem(realIndex, realIndex + 1)}
                      >
                        <Icon name="chevronRight" size={15} className="queue-down" />
                      </IconButton>
                      <IconButton
                        size="sm"
                        label="移出队列"
                        onClick={() => playerController.removeFromQueue(realIndex)}
                      >
                        <Icon name="close" size={15} />
                      </IconButton>
                    </div>
                  </div>
                );
              })}
              {/* The insertion point, drawn where the item will actually land -
                  a gap is between rows, so it cannot be shown by highlighting
                  one. Hidden while the drop would be a no-op. */}
              {drag && target !== drag.from ? (
                <div className="queue-drop" style={{ top: target * drag.rowHeight + 'px' }} />
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </BottomSheet>
  );
}
