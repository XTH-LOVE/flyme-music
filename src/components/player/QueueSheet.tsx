import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/design-system/components/IconButton';
import { TrackCover } from '@/components/TrackCover';
import { BottomSheet } from '@/design-system/components/BottomSheet';
import { playerController } from '@/player';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { suggestNextTracks } from '@/player/smartQueue';
import { notify } from '@/utils/notify';
import { listCachedCards } from '@/audio/analysis/cache';
import { trackKeyOf } from '@/audio/analysis/types';
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
  const favoriteTracks = useLibraryStore((s) => s.favoriteTracks);
  const recentTracks = useLibraryStore((s) => s.recentTracks);
  const playLog = useLibraryStore((s) => s.playLog);
  const rowsRef = useRef<HTMLDivElement>(null);
  const origin = useRef<{ y: number; geometry: SlotGeometry } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [smartLoading, setSmartLoading] = useState(false);

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
  const addSmartNext = async () => {
    if (!nowPlaying) return;
    setSmartLoading(true);
    const queued = new Set(queue.map((item) => item.source + ':' + item.id));
    try {
      const cards = await listCachedCards();
      const cardsByKey = new Map(cards.map((card) => [card.trackKey, card]));
      const currentCard = cardsByKey.get(trackKeyOf(nowPlaying));
      const playStats = new Map<string, { count: number; lastPlayedAt?: number }>();
      for (const entry of playLog) {
        const current = playStats.get(entry.key) ?? { count: 0 };
        current.count += 1;
        current.lastPlayedAt = Math.max(current.lastPlayedAt ?? 0, entry.ts);
        playStats.set(entry.key, current);
      }
      const candidateTracks = new Map<string, typeof nowPlaying>();
      for (const track of [...favoriteTracks, ...recentTracks, ...cards.map((card) => card.track)]) {
        candidateTracks.set(trackKeyOf(track), track);
      }
      const candidates = [...candidateTracks.values()]
        .filter((item) => !queued.has(item.source + ':' + item.id))
        .map((track) => {
          const key = track.source + ':' + track.id;
          const card = cardsByKey.get(trackKeyOf(track));
          const stats = playStats.get(key);
          return {
            track,
            features: card,
            liked: favoriteTracks.some((favorite) => favorite.source === track.source && favorite.id === track.id),
            playCount: stats?.count,
            lastPlayedAt: stats?.lastPlayedAt,
          };
        });
      const suggestions = suggestNextTracks(nowPlaying, candidates, {
        limit: 2,
        currentFeatures: currentCard,
      });
      if (!suggestions.length) {
        notify('暂时没有合适的推荐歌曲');
        return;
      }
      playerController.playNext(suggestions.map((item) => item.track));
      notify(currentCard ? '已按听感添加 ' + suggestions.length + ' 首推荐' : '已添加 ' + suggestions.length + ' 首智能推荐');
    } finally {
      setSmartLoading(false);
    }
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

        {nowPlaying ? (
          <>
            <div className="queue-section-head">
              <div className="queue-section-title">接下来播放</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="queue-clear" onClick={() => void addSmartNext()} disabled={smartLoading}>
                  <Icon name="refresh" size={14} />
                  {smartLoading ? '分析中…' : '智能补充'}
                </button>
                {/* Only the pending songs: this button sits under 接下来播放, so
                    clearing the whole queue would also stop the current track. */}
                {upNext.length ? (
                  <button className="queue-clear" onClick={() => playerController.clearUpNext()}>
                    <Icon name="trash" size={14} />
                    清空待播
                  </button>
                ) : null}
              </div>
            </div>
            {upNext.length ? <div className={'queue-rows' + (drag ? ' queue-rows--dragging' : '')} ref={rowsRef}>
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
                      title="拖动排序"
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
            </div> : <div className="queue-section-title" style={{ padding: '12px 0', opacity: 0.6 }}>暂无待播歌曲</div>}
          </>
        ) : null}
      </div>
    </BottomSheet>
  );
}
