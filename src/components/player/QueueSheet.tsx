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

/** Queue drawer: reorder, remove, clear. Drawer on desktop, sheet on mobile. */
export function QueueSheet({ open, onClose }: QueueSheetProps) {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const status = usePlayerStore((s) => s.status);

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
                <TrackCover track={nowPlaying} bare radius="var(--am-radius-sm)" />
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
              <button className="queue-clear" onClick={() => playerController.clearQueue()}>
                <Icon name="trash" size={14} />
                清空队列
              </button>
            </div>
            {upNext.map((track, i) => {
              const realIndex = queueIndex + 1 + i;
              return (
                <div
                  key={track.source + ':' + track.id + '-' + realIndex}
                  className="queue-item"
                  role="button"
                  tabIndex={0}
                  aria-label={'播放 ' + track.name + ' - ' + track.artist.join(' / ')}
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
                      label="上移"
                      onClick={() => playerController.moveQueueItem(realIndex, realIndex - 1)}
                    >
                      <Icon name="chevronLeft" size={15} className="queue-up" />
                    </IconButton>
                    <IconButton
                      size="sm"
                      label="下移"
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
