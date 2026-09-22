import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { TrackCover } from '@/components/TrackCover';
import { useLibraryStore } from '@/store/useLibraryStore';
import type { MusicTrack } from '@/music/source/types';
import './albums-page.css';

/**
 * The album wall.
 *
 * The library is a list, and a list is a poor memory aid: music is remembered
 * as pictures. This is the same collection seen the way a shelf is seen - one
 * tile per album, no rows, no counts, nothing to read.
 *
 * Built from what is already on the device rather than fetched: the albums
 * someone has are the ones they favourited, played or imported, and asking a
 * server for a list would be both slower and less true to what is here.
 *
 * An album is identified by its name plus its first artist. Name alone merges
 * every self-titled record; artist alone merges compilations, which is the
 * opposite of the point.
 */
interface Album {
  id: string;
  name: string;
  artist: string;
  cover?: string;
  tracks: MusicTrack[];
}

function albumKey(track: MusicTrack): string {
  return (track.album || track.name) + '::' + (track.artist[0] ?? '');
}

export function AlbumsPage() {
  const navigate = useNavigate();
  const favoriteTracks = useLibraryStore((s) => s.favoriteTracks);
  const recentTracks = useLibraryStore((s) => s.recentTracks);

  const albums = useMemo<Album[]>(() => {
    const grouped = new Map<string, Album>();
    // Favourites first, so they win the cover when both lists hold a track
    // from the same record - a favourite is the more deliberate signal.
    for (const track of [...favoriteTracks, ...recentTracks]) {
      const key = albumKey(track);
      const existing = grouped.get(key);
      if (existing) {
        if (!existing.tracks.some((t) => t.id === track.id)) existing.tracks.push(track);
        continue;
      }
      grouped.set(key, {
        id: key,
        name: track.album || '未知专辑',
        artist: track.artist.join(' / '),
        cover: track.picUrl,
        tracks: [track],
      });
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }, [favoriteTracks, recentTracks]);

  if (!albums.length) {
    return (
      <div className="albums-page">
        <div className="albums-empty">
          <Icon name="album" size={28} />
          <div className="albums-empty__title">还没有专辑</div>
          <div className="albums-empty__sub">
            喜欢的歌和最近听过的歌会按专辑归到这里，听一段时间再回来看看。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="albums-page">
      <header className="albums-head">
        <div className="albums-head__title">专辑墙</div>
        <div className="albums-head__sub">{albums.length} 张专辑</div>
      </header>

      <div className="albums-grid">
        {albums.map((album) => (
          <button
            key={album.id}
            className="albums-tile"
            onClick={() => {
              // Playing the album is the only thing a tile can usefully do;
              // there is no album detail page to open.
              navigate('/');
              void import('@/player').then(({ playerController }) =>
                playerController.playTracks(album.tracks),
              );
            }}
            title={album.name + ' · ' + album.artist}
          >
            <div className="albums-tile__cover">
              {/*
                Not `priority`: that asks the CDN for 500x500, and these tiles
                are about a hundred and fifty pixels. A wall of them at that
                size is the same mistake as the list rows were.
              */}
              <TrackCover
                track={{ ...album.tracks[0], picUrl: album.cover }}
                bare
                radius="10px"
              />
            </div>
            <div className="albums-tile__name">{album.name}</div>
            <div className="albums-tile__artist">{album.artist}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
