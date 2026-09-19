import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/design-system/components/IconButton';
import { TrackCover } from '@/components/TrackCover';
import { BottomSheet } from '@/design-system/components/BottomSheet';
import { playerController } from '@/player';
import { usePlayerStore } from '@/store/usePlayerStore';
import { formatTime } from '@/utils/format';
import './fullplayer.css';
import './drawer.css';

interface QueueSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Queue drawer: reorder (drag on desktop, buttons everywhere), remove, clear. */
export function QueueSheet({ open, onClose }: QueueSheetProps) {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const status = usePlayerStore((s) => s.status);
  // HTML5 drag state: indices are within the "up next" slice (touch users
  // keep the up/down buttons, which are unaffected by draggable).
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const handleDrop = (target: number) => {
    if (dragFrom !== null && dragFrom !== target) {
      const from = queueIndex + 1 + dragFrom;
      const to = queueIndex + 1 + target;
      playerController.moveQueueItem(from, to);
    }
    setDragFrom(null);
    setDragOver(null);
  };

  const nowPlaying = queue[queueIndex];
  const upNext = queue.slice(queueIndex + 1);

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
            {upNext.map((track, i) => {
              const realIndex = queueIndex + 1 + i;
              return (
                <div
                  key={track.source + ':' + track.id + '-' + realIndex}
                  className={
                    'queue-item' +
                    (dragFrom === i ? ' queue-item--dragging' : '') +
                    (dragOver === i && dragFrom !== null && dragFrom !== i ? ' queue-item--drop' : '')
                  }
                  role="button"
                  tabIndex={0}
                  aria-label={'播放 ' + track.name + ' - ' + track.artist.join(' / ')}
                  draggable
                  onDragStart={(e) => {
                    setDragFrom(i);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(i));
                  }}
                  onDragOver={(e) => {
                    if (dragFrom === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOver(i);
                  }}
                  onDragLeave={() => setDragOver((cur) => (cur === i ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(i);
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  onClick={() => playerController.jumpToQueueIndex(realIndex)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      playerController.jumpToQueueIndex(realIndex);
                    }
                  }}
                >
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
          </>
        ) : null}
      </div>
    </BottomSheet>
  );
}
