import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { TrackListItem } from '@/components/TrackListItem';
import { TrackCover } from '@/components/TrackCover';
import { PlaylistArt } from '@/components/PlaylistArt';
import { Dialog } from '@/design-system/components/Dialog';
import { EmptyState } from '@/design-system/components/EmptyState';
import { playerController } from '@/player';
import { usePlaylistStore } from '@/store/usePlaylistStore';
import './pages.css';

export function UserPlaylistDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const playlists = usePlaylistStore((s) => s.playlists);
  const renamePlaylist = usePlaylistStore((s) => s.renamePlaylist);
  const deletePlaylist = usePlaylistStore((s) => s.deletePlaylist);
  const removeTrack = usePlaylistStore((s) => s.removeTrack);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const playlist = playlists.find((p) => p.id === id);
  if (!playlist) return <EmptyState title="歌单不存在" description="它可能已经被删除" />;

  const first = playlist.tracks[0];

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="detail-hero__cover">
          {first ? (
            <TrackCover track={first} radius="var(--am-radius-xl)" title={playlist.name} />
          ) : (
            <PlaylistArt name={playlist.name} seed={playlist.id} radius="var(--am-radius-xl)" />
          )}
        </div>
        <div className="detail-hero__info">
          <div className="detail-hero__tag">我的歌单</div>
          <h1 className="detail-hero__title">{playlist.name}</h1>
          <p className="detail-hero__meta">{playlist.tracks.length} 首</p>
          <div className="detail-hero__actions">
            <button className="am-btn am-btn--primary am-btn--md" disabled={!playlist.tracks.length} onClick={() => playerController.playTracks(playlist.tracks, 0)}>
              <Icon name="play" size={16} />
              播放全部
            </button>
            <button className="am-btn am-btn--secondary am-btn--md" onClick={() => { setNewName(playlist.name); setRenameOpen(true); }}>
              重命名
            </button>
            <button className="am-btn am-btn--ghost am-btn--md" onClick={() => setDeleteOpen(true)}>
              <Icon name="trash" size={15} />
            </button>
          </div>
        </div>
      </div>

      {playlist.tracks.length ? (
        <div className="song-list">
          {playlist.tracks.map((track, i) => (
            <TrackListItem
              key={track.source + ':' + track.id + ':' + i}
              track={track}
              context={playlist.tracks}
              index={i}
              onRemove={() => removeTrack(playlist.id, track)}
            />
          ))}
        </div>
      ) : (
        <EmptyState icon="library" title="歌单还是空的" description="在歌曲右侧菜单里选择「添加到歌单」" />
      )}

      <Dialog open={renameOpen} title="重命名歌单" onClose={() => setRenameOpen(false)}>
        <input
          className="picker-create__input"
          style={{ width: '100%', marginBottom: 16 }}
          value={newName}
          autoFocus
          onChange={(e) => setNewName(e.target.value)}
        />
        <div className="detail-hero__actions">
          <button
            className="am-btn am-btn--primary am-btn--md am-btn--block"
            onClick={() => {
              renamePlaylist(playlist.id, newName);
              setRenameOpen(false);
            }}
          >
            保存
          </button>
        </div>
      </Dialog>

      <Dialog open={deleteOpen} title="删除歌单" onClose={() => setDeleteOpen(false)}>
        <p style={{ margin: '0 0 16px', color: 'var(--am-text-2)', fontSize: 14 }}>
          确定删除「{playlist.name}」吗？此操作无法撤销。
        </p>
        <div className="detail-hero__actions">
          <button className="am-btn am-btn--secondary am-btn--md am-btn--block" onClick={() => setDeleteOpen(false)}>
            取消
          </button>
          <button
            className="am-btn am-btn--danger am-btn--md am-btn--block"
            onClick={() => {
              deletePlaylist(playlist.id);
              navigate('/library');
            }}
          >
            删除
          </button>
        </div>
      </Dialog>
    </div>
  );
}
