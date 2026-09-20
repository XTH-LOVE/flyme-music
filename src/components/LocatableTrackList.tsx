import { useRef, useState } from 'react';
import { TrackListItem } from '@/components/TrackListItem';
import { LocatePlayingButton, usePlayingIndex } from '@/components/LocatePlayingButton';
import { ProgressiveList } from '@/components/ProgressiveList';
import type { MusicTrack } from '@/music/source/types';

interface LocatableTrackListProps {
  tracks: MusicTrack[];
  /** Change this (e.g. the playlist id) to collapse the list back to one slice. */
  resetKey?: string | number;
}

/**
 * A `.song-list` of tracks plus the "locate the playing song" shortcut.
 *
 * Every track list in the app has the same three needs — a slice that can be
 * widened, a scroll target, and the button — so they live together here rather
 * than being repeated per page.
 */
export function LocatableTrackList({ tracks, resetKey }: LocatableTrackListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const playingIndex = usePlayingIndex(tracks);
  // A jump has to widen the slice before the row exists, so the index lives in
  // state and the scroll runs after the commit that follows. The token lets a
  // second tap on the same row scroll again.
  const [jump, setJump] = useState<{ index: number; token: number } | null>(null);
  const token = useRef(0);

  const reveal = (index: number) => {
    token.current += 1;
    setJump({ index, token: token.current });
  };

  return (
    <>
      <div className="song-list" ref={listRef}>
        <ProgressiveList
          items={tracks}
          resetKey={resetKey}
          revealTo={jump?.index}
          renderItem={(track, i) => (
            <TrackListItem key={track.id + ':' + i} track={track} context={tracks} index={i} />
          )}
        />
      </div>
      <LocatePlayingButton containerRef={listRef} index={playingIndex} onReveal={reveal} />
    </>
  );
}
