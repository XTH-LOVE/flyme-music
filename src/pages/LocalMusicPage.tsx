import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { SectionHeader } from '@/design-system/components/SectionHeader';
import { EmptyState } from '@/design-system/components/EmptyState';
import { DuplicateSongsPanel } from '@/components/DuplicateSongsPanel';
import { TrackListItem } from '@/components/TrackListItem';
import { LocatePlayingButton, usePlayingIndex } from '@/components/LocatePlayingButton';
import { ProgressiveList } from '@/components/ProgressiveList';
import { FastIndexBar } from '@/components/FastIndexBar';
import { collectIndexLetters, indexBarLetters, indexKeyOf } from '@/utils/indexLetters';
import { rowSelector } from '@/utils/locatePlaying';
import { playerController } from '@/player';
import { useLocalLibraryStore } from '@/store/useLocalLibraryStore';
import { clearOfflineCache, formatBytes, offlineStats, type OfflineStats } from '@/library/offlineCache';
import { warmupAnalysis } from '@/audio/analysis';
import { notify } from '@/utils/notify';
import './pages.css';
import { pickFiles } from '@/utils/pickFiles';

/** Below this the bar is more clutter than shortcut. */
const INDEX_BAR_MIN_TRACKS = 20;

/**
 * 本地音乐：用户自选的音频文件（IndexedDB 持久化），与在线歌曲共用
 * 播放器/队列/喜欢/歌单。附带离线缓存管理（在线歌曲的字节缓存）。
 */
export function LocalMusicPage() {
  const tracks = useLocalLibraryStore((s) => s.tracks);
  const loading = useLocalLibraryStore((s) => s.loading);
  const importFiles = useLocalLibraryStore((s) => s.importFiles);
  const remove = useLocalLibraryStore((s) => s.remove);
  const listRef = useRef<HTMLDivElement>(null);
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState<OfflineStats | null>(null);

  const titles = useMemo(() => tracks.map((track) => track.name), [tracks]);
  const indexLetters = useMemo(() => indexBarLetters(titles), [titles]);
  const presentLetters = useMemo(() => new Set(collectIndexLetters(titles)), [titles]);

  // A jump has to widen ProgressiveList's slice before the row exists, so the
  // index lives in state and the scroll runs in the effect that follows the
  // commit. The token makes a repeated tap on the same letter scroll again.
  const [jump, setJump] = useState<{ index: number; token: number } | null>(null);
  const jumpToken = useRef(0);
  const playingIndex = usePlayingIndex(tracks);

  useEffect(() => {
    if (!jump) return;
    listRef.current?.querySelector(rowSelector(jump.index))?.scrollIntoView({ block: 'start' });
  }, [jump]);

  const revealRow = (index: number) => {
    jumpToken.current += 1;
    setJump({ index, token: jumpToken.current });
  };

  const jumpToLetter = (letter: string) => {
    const index = tracks.findIndex((track) => indexKeyOf(track.name) === letter);
    if (index < 0) return;
    revealRow(index);
  };

  const refreshStats = () => {
    void offlineStats().then(setStats);
  };
  // Count/size are cheap; refresh whenever the page re-renders a new mount.
  if (stats === null) refreshStats();

  /**
   * The picker is asked here rather than through a hidden <input type="file">.
   *
   * That input is the reason this page could not import anything in the
   * packaged app: the Android WebView only opens a picker if the host
   * implements onShowFileChooser, and this one does not. See `pickFiles` for
   * what happens instead.
   */
  const handlePick = async () => {
    const files = await pickFiles({
      accept: 'audio/*,.mp3,.flac,.m4a,.aac,.ogg,.opus,.wav',
      multiple: true,
      title: '选择音频文件',
    });
    if (!files.length) return;
    setImporting(true);
    try {
      const { imported, skipped } = await importFiles(files);
      notify('已导入 ' + imported + ' 首' + (skipped ? '，跳过 ' + skipped + ' 个非音频文件' : ''));
      refreshStats();
      // The scan is over and the user is not waiting on anything, which is the
      // one cheap moment to build the feature index the similarity search and
      // taste profile read. It is opportunistic: silent, budgeted, and gated on
      // the user's settings and connection inside `warmupAnalysis`.
      void warmupAnalysis(useLocalLibraryStore.getState().tracks);
    } catch (e) {
      notify(e instanceof Error ? e.message : '导入失败');
    } finally {
      setImporting(false);
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
            onClick={() => void handlePick()}
          >
            {importing ? '导入中…' : '选择文件'}
          </button>
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
      {/* Only appears when there is something to clean up. */}
      <DuplicateSongsPanel
        tracks={tracks}
        onRemove={(track) => {
          void remove(track).then(() => notify('已移除《' + track.name + '》的重复副本'));
        }}
      />
      {loading ? (
        <EmptyState icon="music" title="读取中…" description="正在加载本地曲库" />
      ) : tracks.length === 0 ? (
        <EmptyState
          icon="music"
          title="还没有本地歌曲"
          description="点击上方「选择文件」，把电脑或手机里的音频加进来，本地与在线歌曲可以混排播放"
        />
      ) : (
        <>
          <div className="song-list" ref={listRef}>
            <ProgressiveList
              items={tracks}
              revealTo={jump?.index}
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
          {tracks.length >= INDEX_BAR_MIN_TRACKS ? (
            <FastIndexBar
              letters={indexLetters}
              available={presentLetters}
              onLetterChange={jumpToLetter}
            />
          ) : null}
          <LocatePlayingButton
            containerRef={listRef}
            index={playingIndex}
            onReveal={revealRow}
          />
        </>
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
