import { TrackListItem } from './TrackListItem';
import { songToTrack } from '@/music/source/types';
import type { Song } from '@/music/types';

interface SongListItemProps {
  song: Song;
  context: Song[];
  index?: number;
  /** Kept for call-site compatibility; TrackListItem always shows the album. */
  showAlbum?: boolean;
}

/**
 * Song row for the local library. Legacy Song-based facade over TrackListItem
 * (songToTrack carries palette/duration, and the mock source renders no badge
 * and a palette cover, so the output matches the old dedicated component).
 */
export function SongListItem({ song, context, index }: SongListItemProps) {
  return (
    <TrackListItem
      track={songToTrack(song)}
      context={context.map(songToTrack)}
      index={index}
    />
  );
}
