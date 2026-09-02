import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/design-system/components/IconButton';
import { Cover } from '@/design-system/components/Cover';
import { TrackActionsSheet } from '@/components/TrackActionsSheet';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { playerController } from '@/player';
import { songToTrack } from '@/music/source/types';
import type { Song } from '@/music/types';
import { formatTime } from '@/utils/format';
import './components.css';

interface SongListItemProps {
  song: Song;
  context: Song[];
  index?: number;
  showAlbum?: boolean;
}

/** Song row for the local library - also gets the "more" actions sheet. */
export function SongListItem({ song, context, index, showAlbum = true }: SongListItemProps) {
  const currentId = usePlayerStore((s) => s.current?.id);
  const isPlaying = usePlayerStore((s) => s.status === 'playing');
  const favorites = useLibraryStore((s) => s.favoriteSongIds);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const [actionsOpen, setActionsOpen] = useState(false);
  const active = currentId === song.id;
  const fav = favorites.includes(song.id);

  return (
    <>
      <div
        className={'song-item' + (active ? ' song-item--active' : '')}
        onClick={() => playerController.playSong(song, context)}
      >
        {typeof index === 'number' ? <span className="song-item__index">{index + 1}</span> : null}
        <div className="song-item__cover">
          <Cover palette={song.palette} bare radius="var(--am-radius-sm)" />
          {active ? (
            <div className={'song-item__eq' + (isPlaying ? ' song-item__eq--on' : '')}>
              <span />
              <span />
              <span />
            </div>
          ) : null}
        </div>
        <div className="song-item__body">
          <div className="song-item__title">{song.title}</div>
          <div className="song-item__meta">
            {song.artistName}
            {showAlbum ? ' · ' + song.albumName : ''}
          </div>
        </div>
        <div className="song-item__duration">{formatTime(song.duration)}</div>
        <IconButton
          size="sm"
          accent={fav}
          label={fav ? '取消喜欢' : '喜欢'}
          onClick={() => toggleFavorite(song.id)}
        >
          <Icon name={fav ? 'heartFill' : 'heart'} size={17} />
        </IconButton>
        <IconButton size="sm" label="更多操作" onClick={() => setActionsOpen(true)}>
          <Icon name="more" size={17} />
        </IconButton>
      </div>
      <TrackActionsSheet
        open={actionsOpen}
        track={songToTrack(song)}
        onClose={() => setActionsOpen(false)}
      />
    </>
  );
}
