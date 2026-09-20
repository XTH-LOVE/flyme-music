import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { BottomSheet } from '@/design-system/components/BottomSheet';
import { usePlaylistStore } from '@/store/usePlaylistStore';
import { playerController } from '@/player';
import { playFromAlternateSource } from '@/player/alternateSource';
import { downloadTrack } from '@/utils/download';
import { notify } from '@/utils/notify';
import { cacheTrackAudio, isTrackCached, removeCachedTrack } from '@/library/offlineCache';
import { resolveTrackUrl } from '@/music/source/track-resolver';
import { getPlaybackFailure } from '@/player/playbackFailure';
import type { MusicTrack } from '@/music/source/types';
import { sourceLabels } from '@/music/source/types';
import { CommentsSheet } from './CommentsSheet';
import './actions.css';

interface TrackActionsSheetProps {
  open: boolean;
  track: MusicTrack | null;
  onClose: () => void;
}

/**
 * Track "more" menu: download / offline cache / comments / add-to-playlist.
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
  const [caching, setCaching] = useState(false);
  const [cached, setCached] = useState<boolean | null>(null);
  const [switching, setSwitching] = useState(false);
  const [failureTick, setFailureTick] = useState(0);

  const canCache = track ? track.source !== 'mock' && track.source !== 'local' : false;
  const canDownload = canCache;
  const canComment = track?.source === 'netease';
  const canSwitch = canCache;
  // Re-read on open and after a switch so the panel reflects the latest attempt.
  const failure = useMemo(
    () => (track ? getPlaybackFailure(track.source, track.id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- failureTick / open are intentional refresh triggers
    [track?.source, track?.id, failureTick, open],
  );

  const handleSwitchSource = async () => {
    if (!track || switching) return;
    setSwitching(true);
    try {
      const ok = await playFromAlternateSource(track);
      if (ok) {
        notify('已从其他音源播放《' + track.name + '》');
        setFailureTick((v) => v + 1);
        onClose();
      } else {
        notify('其他音源没找到这首歌，试试手动搜索');
      }
    } catch {
      notify('换源失败，稍后再试');
    } finally {
      setSwitching(false);
    }
  };

  const refreshCached = () => {
    if (track && canCache) void isTrackCached(track).then(setCached);
    else setCached(false);
  };
  // Re-check cache state each time the sheet opens for a (new) track.
  useEffect(() => {
    if (open) refreshCached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, track?.source, track?.id]);

  const handleCache = async () => {
    if (!track || caching) return;
    setCaching(true);
    setDownloadMsg(null);
    try {
      if (cached) {
        await removeCachedTrack(track);
        setCached(false);
        setDownloadMsg('已移除离线缓存');
      } else {
        const url = await resolveTrackUrl(track);
        if (!url || url.startsWith('blob:')) throw new Error('暂时无法获取音频地址');
        await cacheTrackAudio(track, url);
        setCached(true);
        setDownloadMsg('已缓存，离线也能听');
      }
    } catch (e) {
      setDownloadMsg(e instanceof Error ? e.message : '缓存失败');
    } finally {
      setCaching(false);
    }
  };

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
              {canCache ? (
                <button className="action-row" disabled={caching} onClick={() => void handleCache()}>
                  <div className="action-row__icon">
                    <Icon name="clock" size={18} />
                  </div>
                  <span>
                    {caching ? '缓存中…' : cached ? '移除离线缓存' : '缓存离线收听'}
                  </span>
                </button>
              ) : null}
              {canSwitch ? (
                <button className="action-row" disabled={switching} onClick={() => void handleSwitchSource()}>
                  <div className="action-row__icon">
                    <Icon name="compass" size={18} />
                  </div>
                  <span>{switching ? '正在找其他音源…' : '换源重试'}</span>
                </button>
              ) : null}
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
            {failure ? (
              <div className="action-msg action-msg--warn">
                上次在「{sourceLabels[failure.source]}」播放失败（{failure.message}），可以试试换源重试
              </div>
            ) : null}

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
