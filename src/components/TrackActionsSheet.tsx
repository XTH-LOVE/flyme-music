import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { BottomSheet } from '@/design-system/components/BottomSheet';
import { usePlaylistStore } from '@/store/usePlaylistStore';
import { playerController } from '@/player';
import { downloadTrack } from '@/utils/download';
import type { MusicTrack } from '@/music/source/types';
import { CommentsSheet } from './CommentsSheet';
import './actions.css';

interface TrackActionsSheetProps {
  open: boolean;
  track: MusicTrack | null;
  onClose: () => void;
}

/**
 * Track "more" menu: download / comments / add-to-playlist.
 * Replaces the old playlist-only picker for every track row.
 */
export function TrackActionsSheet({ open, track, onClose }: TrackActionsSheetProps) {
  const playlists = usePlaylistStore((s) => s.playlists);
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
  const addTrack = usePlaylistStore((s) => s.addTrack);
  const [newName, setNewName] = useState('');
  const [addedId, setAddedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const canDownload = track ? track.source !== 'mock' : false;
  const canComment = track?.source === 'netease';

  const handleAdd = (playlistId: string) => {
    if (!track) return;
    addTrack(playlistId, track);
    setAddedId(playlistId);
    window.setTimeout(() => setAddedId(null), 1200);
  };

  const handleCreate = () => {
    if (!track || !newName.trim()) return;
    const id = createPlaylist(newName);
    setNewName('');
    handleAdd(id);
  };

  const handleDownload = async () => {
    if (!track || downloading) return;
    setDownloading(true);
    setDownloadMsg(null);
    try {
      await downloadTrack(track);
      setDownloadMsg('已开始下载');
    } catch (e) {
      setDownloadMsg(e instanceof Error ? e.message : '下载失败');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <BottomSheet
        open={open && !commentsOpen}
        title={track ? track.name + ' · ' + track.artist.join(' / ') : ''}
        onClose={onClose}
      >
        {track ? (
          <>
            <div className="action-rows">
              {track ? (
                <button
                  className="action-row"
                  onClick={() => {
                    playerController.playNext([track]);
                    onClose();
                  }}
                >
                  <div className="action-row__icon">
                    <Icon name="next" size={18} />
                  </div>
                  <span>下一首播放</span>
                </button>
              ) : null}
              {canDownload ? (
                <button className="action-row" onClick={() => void handleDownload()}>
                  <div className="action-row__icon">
                    <Icon name="download" size={18} />
                  </div>
                  <span>{downloading ? '解析下载中…' : '下载歌曲'}</span>
                </button>
              ) : (
                <div className="action-row action-row--disabled">
                  <div className="action-row__icon">
                    <Icon name="download" size={18} />
                  </div>
                  <span>本地演示曲目不支持下载</span>
                </div>
              )}
              {canComment ? (
                <button className="action-row" onClick={() => setCommentsOpen(true)}>
                  <div className="action-row__icon">
                    <Icon name="lyric" size={18} />
                  </div>
                  <span>查看热评</span>
                </button>
              ) : null}
            </div>
            {downloadMsg ? <div className="action-msg">{downloadMsg}</div> : null}

            <div className="picker-section-title">添加到歌单</div>
            <div className="picker-create">
              <input
                className="picker-create__input"
                placeholder="新建歌单名称"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
              />
              <button className="am-btn am-btn--primary am-btn--sm" onClick={handleCreate}>
                创建并添加
              </button>
            </div>
            <div className="picker-list">
              {playlists.length === 0 ? (
                <div className="picker-empty">还没有歌单，先创建一个吧</div>
              ) : (
                playlists.map((pl) => (
                  <button key={pl.id} className="picker-item" onClick={() => handleAdd(pl.id)}>
                    <div className="picker-item__icon">
                      <Icon name="library" size={18} />
                    </div>
                    <div className="picker-item__body">
                      <div className="picker-item__name">{pl.name}</div>
                      <div className="picker-item__count">{pl.tracks.length} 首</div>
                    </div>
                    {addedId === pl.id ? (
                      <Icon name="check" size={18} className="picker-item__check" />
                    ) : (
                      <Icon name="chevronRight" size={16} className="picker-item__chevron" />
                    )}
                  </button>
                ))
              )}
            </div>
          </>
        ) : null}
      </BottomSheet>
      {track ? (
        <CommentsSheet
          open={commentsOpen}
          trackName={track.name}
          songId={track.id}
          onClose={() => setCommentsOpen(false)}
        />
      ) : null}
    </>
  );
}
