import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { SectionHeader } from '@/design-system/components/SectionHeader';
import { EmptyState } from '@/design-system/components/EmptyState';
import { TrackListItem } from '@/components/TrackListItem';
import { ProgressiveList } from '@/components/ProgressiveList';
import { playerController } from '@/player';
import { useLocalLibraryStore } from '@/store/useLocalLibraryStore';
import { clearOfflineCache, formatBytes, offlineStats, type OfflineStats } from '@/library/offlineCache';
import { notify } from '@/utils/notify';
import './pages.css';

/**
 * 本地音乐：用户自选的音频文件（IndexedDB 持久化），与在线歌曲共用
 * 播放器/队列/喜欢/歌单。附带离线缓存管理（在线歌曲的字节缓存）。
 */
export function LocalMusicPage() {
  const tracks = useLocalLibraryStore((s) => s.tracks);
  const loading = useLocalLibraryStore((s) => s.loading);
  const importFiles = useLocalLibraryStore((s) => s.importFiles);
  const remove = useLocalLibraryStore((s) => s.remove);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState<OfflineStats | null>(null);

  const refreshStats = () => {
    void offlineStats().then(setStats);
  };
  // Count/size are cheap; refresh whenever the page re-renders a new mount.
  if (stats === null) refreshStats();

  const handlePick = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setImporting(true);
    try {
      const { imported, skipped } = await importFiles(Array.from(files));
      notify('已导入 ' + imported + ' 首' + (skipped ? '，跳过 ' + skipped + ' 个非音频文件' : ''));
      refreshStats();
    } catch (e) {
      notify(e instanceof Error ? e.message : '导入失败');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">本地音乐</h1>

      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">导入本地音频</div>
            <div className="settings-row__desc">
              支持从文件夹选择 mp3 / flac / m4a 等音频，文件保存在本设备
            </div>
          </div>
          <button
            className="am-btn am-btn--primary am-btn--sm"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
          >
            {importing ? '导入中…' : '选择文件'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.flac,.m4a,.aac,.ogg,.opus,.wav"
            multiple
            hidden
            onChange={(e) => void handlePick(e.target.files)}
          />
        </div>
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">离线缓存</div>
            <div className="settings-row__desc">
              {stats && stats.count
                ? stats.count + ' 首在线歌曲已缓存 · ' + formatBytes(stats.bytes)
                : '缓存在线歌曲后，离线也能播放'}
            </div>
          </div>
          {stats && stats.count ? (
            <button
              className="am-btn am-btn--secondary am-btn--sm"
              onClick={() => {
                void clearOfflineCache().then(() => {
                  setStats({ count: 0, bytes: 0 });
                  notify('已清空离线缓存');
                });
              }}
            >
              清空
            </button>
          ) : null}
        </div>
      </div>

      <SectionHeader title={'歌曲 · ' + tracks.length} />
      {loading ? (
        <EmptyState icon="music" title="读取中…" description="正在加载本地曲库" />
      ) : tracks.length === 0 ? (
        <EmptyState
          icon="music"
          title="还没有本地歌曲"
          description="点击上方「选择文件」，把电脑或手机里的音频加进来，本地与在线歌曲可以混排播放"
        />
      ) : (
        <div className="song-list">
          <ProgressiveList
            items={tracks}
            renderItem={(track, i) => (
              <TrackListItem
                key={'local:' + track.id}
                track={track}
                context={tracks}
                index={i}
                onRemove={() => {
                  void remove(track).then(() => notify('已从本地曲库移除'));
                }}
              />
            )}
          />
        </div>
      )}

      {tracks.length ? (
        <button
          className="am-btn am-btn--primary am-btn--md load-more"
          onClick={() => playerController.playTracks(tracks, 0)}
        >
          <Icon name="play" size={15} />
          播放全部
        </button>
      ) : null}
    </div>
  );
}
