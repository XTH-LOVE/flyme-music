import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { TrackCover } from '@/components/TrackCover';
import { findDuplicates } from '@/music/playlistTools';
import { formatTime } from '@/utils/format';
import type { MusicTrack } from '@/music/source/types';
import './duplicate-songs.css';

interface DuplicateSongsPanelProps {
  tracks: MusicTrack[];
  /** Called for each copy the user chooses to drop. */
  onRemove: (track: MusicTrack) => void;
}

/**
 * Review of duplicate recordings in the local library.
 *
 * Deliberately a review rather than a "clean up" button: the grouping is a
 * guess, and the copies are files the user imported themselves. Every group
 * shows what it found and which copy it would keep, and nothing is removed
 * without a tap.
 *
 * Rendering nothing when there are no duplicates is the point - a permanent
 * "0 duplicates" card would be noise on every visit.
 */
export function DuplicateSongsPanel({ tracks, onRemove }: DuplicateSongsPanelProps) {
  const groups = useMemo(() => findDuplicates(tracks), [tracks]);
  const [open, setOpen] = useState(false);

  if (!groups.length) return null;

  const total = groups.reduce((sum, group) => sum + group.indices.length - 1, 0);

  return (
    <section className="dup-panel">
      <button
        className="dup-panel__head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="library" size={18} />
        <span className="dup-panel__head-body">
          <span className="dup-panel__title">发现 {groups.length} 组重复歌曲</span>
          <span className="dup-panel__desc">清理后可释放 {total} 个条目</span>
        </span>
        <Icon
          name="chevronRight"
          size={18}
          className={'dup-panel__chevron' + (open ? ' dup-panel__chevron--open' : '')}
        />
      </button>

      {open ? (
        <div className="dup-panel__body">
          {groups.map((group) => {
            const keep = tracks[group.indices[0]];
            const drop = group.indices.slice(1);
            return (
              <div className="dup-group" key={group.key}>
                <div className="dup-group__head">
                  <span className="dup-group__label">{group.label}</span>
                  {group.kind === 'assumed' ? (
                    // Says out loud that the match rests on the title alone, so
                    // the user knows to look before tapping.
                    <span className="dup-group__badge">时长未知</span>
                  ) : null}
                  <span className="dup-group__count">{group.indices.length} 份</span>
                </div>

                <div className="dup-group__keep">
                  <span className="dup-group__cover">
                    <TrackCover track={keep} bare radius="var(--am-radius-sm)" />
                  </span>
                  <span className="dup-group__keep-body">
                    <span className="dup-group__keep-tag">保留</span>
                    <span className="dup-group__keep-meta">
                      {keep.source}
                      {group.duration ? ' · ' + formatTime(group.duration) : ''}
                    </span>
                  </span>
                </div>

                <div className="dup-group__drop">
                  {drop.map((index) => {
                    const track = tracks[index];
                    return (
                      <button
                        key={track.source + ':' + track.id + ':' + index}
                        className="dup-group__drop-item"
                        onClick={() => onRemove(track)}
                      >
                        <Icon name="trash" size={14} />
                        <span className="dup-group__drop-name">
                          {track.source}
                          {track.duration ? ' · ' + formatTime(track.duration) : ''}
                        </span>
                        <span className="dup-group__drop-action">移除</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
