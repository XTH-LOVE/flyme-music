import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { TrackListItem } from '@/components/TrackListItem';
import { TrackCover } from '@/components/TrackCover';
import { PlaylistArt } from '@/components/PlaylistArt';
import { Dialog } from '@/design-system/components/Dialog';
import { EmptyState } from '@/design-system/components/EmptyState';
import { playerController } from '@/player';
import { usePlaylistStore } from '@/store/usePlaylistStore';
import { notify } from '@/utils/notify';
import { saveBlobInBrowser } from '@/utils/saveBlob';
import {
  dedupeTracks,
  EXPORT_FORMATS,
  exportFileName,
  exportPlaylist,
  filterTracks,
  findDuplicates,
  SORT_OPTIONS,
  sortTracks,
  type ExportFormat,
  type SortDirection,
  type SortField,
} from '@/music/playlistTools';
import './pages.css';

export function UserPlaylistDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const playlists = usePlaylistStore((s) => s.playlists);
  const renamePlaylist = usePlaylistStore((s) => s.renamePlaylist);
  const deletePlaylist = usePlaylistStore((s) => s.deletePlaylist);
  const removeTrack = usePlaylistStore((s) => s.removeTrack);
  const reorderTracks = usePlaylistStore((s) => s.reorderTracks);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [query, setQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('added');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const playlist = playlists.find((p) => p.id === id);

  const tracks = useMemo(() => playlist?.tracks ?? [], [playlist]);
  // Sorting and filtering are view-only: the playlist's stored order is the
  // user's own, so neither should rewrite it behind their back.
  const visible = useMemo(
    () => sortTracks(filterTracks(tracks, query), sortField, sortDir),
    [tracks, query, sortField, sortDir],
  );
  const duplicates = useMemo(() => findDuplicates(tracks), [tracks]);

  if (!playlist) return <EmptyState title="歌单不存在" description="它可能已经被删除" />;

  const first = playlist.tracks[0];
  const filtering = query.trim().length > 0;

  const changeSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(field);
    setSortDir(SORT_OPTIONS.find((o) => o.field === field)?.defaultDirection ?? 'asc');
  };

  const applyDedupe = () => {
    const removed = tracks.length - dedupeTracks(tracks).length;
    reorderTracks(playlist.id, dedupeTracks(tracks));
    notify(removed > 0 ? `已移除 ${removed} 首重复歌曲` : '没有发现重复歌曲');
  };

  const doExport = (format: ExportFormat) => {
    const text = exportPlaylist(visible, format, playlist.name);
    const type = format === 'json' ? 'application/json' : 'text/plain';
    void saveBlobInBrowser(new Blob([text], { type: `${type};charset=utf-8` }), exportFileName(playlist.name, format));
  };

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
        <>
          <div className="playlist-toolbar">
            <div className="playlist-toolbar__search">
              <Icon name="search" size={15} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="在这个歌单里搜索"
                aria-label="在歌单里搜索"
              />
              {query ? (
                <button className="playlist-toolbar__clear" aria-label="清除搜索" onClick={() => setQuery('')}>
                  <Icon name="close" size={14} />
                </button>
              ) : null}
            </div>
            <div className="playlist-toolbar__sorts" role="group" aria-label="排序方式">
              {SORT_OPTIONS.map((option) => {
                const active = option.field === sortField;
                return (
                  <button
                    key={option.field}
                    className={'playlist-chip' + (active ? ' playlist-chip--on' : '')}
                    aria-pressed={active}
                    onClick={() => changeSort(option.field)}
                  >
                    {option.label}
                    {active ? (
                      <Icon
                        name="chevronRight"
                        size={12}
                        className={'playlist-chip__dir playlist-chip__dir--' + sortDir}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="playlist-toolbar__actions">
              {duplicates.length ? (
                <button className="am-btn am-btn--secondary am-btn--sm" onClick={applyDedupe}>
                  <Icon name="trash" size={14} />
                  去重（{duplicates.reduce((n, g) => n + g.indices.length - 1, 0)}）
                </button>
              ) : null}
              {EXPORT_FORMATS.map((f) => (
                <button key={f.format} className="am-btn am-btn--ghost am-btn--sm" onClick={() => doExport(f.format)}>
                  <Icon name="download" size={14} />
                  {f.extension.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {filtering ? (
            <p className="playlist-toolbar__hint">
              匹配 {visible.length} / {playlist.tracks.length} 首
            </p>
          ) : null}

          {visible.length ? (
            <div className="song-list">
              {visible.map((track, i) => (
                <TrackListItem
                  key={track.source + ':' + track.id + ':' + i}
                  track={track}
                  context={visible}
                  index={i}
                  onRemove={() => removeTrack(playlist.id, track)}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon="search" title="没有匹配的歌曲" description="换个关键词试试" />
          )}
        </>
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
