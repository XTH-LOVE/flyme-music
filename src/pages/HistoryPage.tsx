import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { SourceBadge } from '@/components/SourceBadge';
import { TrackCover } from '@/components/TrackCover';
import { EmptyState } from '@/design-system/components/EmptyState';
import { playerController } from '@/player';
import { useLibraryStore, type PlayLogEntry } from '@/store/useLibraryStore';
import type { MusicSource, MusicTrack } from '@/music/source/types';
import { notify } from '@/utils/notify';
import { saveFile } from '@/utils/saveBlob';
import { playLogFileName, toPlayLogCsv, toPlayLogJson } from '@/utils/playLogExport';
import './history.css';

const KNOWN_SOURCES = new Set<MusicSource>([
  'netease',
  'joox',
  'qq',
  'kuwo',
  'higequ',
  'mock',
  'local',
]);

/**
 * Entries written before the `track` snapshot existed only carry a
 * `source:id` key plus display strings, so rebuild a minimal track from those.
 */
function trackOf(entry: PlayLogEntry): MusicTrack | undefined {
  if (entry.track) return entry.track;
  const separator = entry.key.indexOf(':');
  if (separator < 1) return undefined;
  const source = entry.key.slice(0, separator) as MusicSource;
  const id = entry.key.slice(separator + 1);
  if (!id || !KNOWN_SOURCES.has(source)) return undefined;
  return {
    id,
    name: entry.name,
    artist: entry.artist.split('/').map((part) => part.trim()).filter(Boolean),
    album: '',
    pic_id: id,
    url_id: id,
    lyric_id: id,
    source,
  };
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function dayLabel(ts: number): string {
  const date = new Date(ts);
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (diffDays <= 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return diffDays + ' 天前';
  return date.getMonth() + 1 + ' 月 ' + date.getDate() + ' 日';
}

const timeLabel = (ts: number) => {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

/** Full play history, grouped by day, replayable in one tap. */
export function HistoryPage() {
  const playLog = useLibraryStore((s) => s.playLog);
  const clearPlayLog = useLibraryStore((s) => s.clearPlayLog);
  const [confirming, setConfirming] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Stored newest-first, but sort defensively so a merged/synced log can't
  // render out of order.
  const ordered = useMemo(() => [...playLog].sort((a, b) => b.ts - a.ts), [playLog]);

  const groups = useMemo(() => {
    const buckets = new Map<string, PlayLogEntry[]>();
    for (const entry of ordered) {
      const label = dayLabel(entry.ts);
      const bucket = buckets.get(label);
      if (bucket) bucket.push(entry);
      else buckets.set(label, [entry]);
    }
    return [...buckets.entries()].map(([label, items]) => ({ label, items }));
  }, [ordered]);

  const replayable = useMemo(
    () => ordered.map(trackOf).filter((t): t is MusicTrack => Boolean(t)),
    [ordered],
  );

  const playFrom = (entry: PlayLogEntry) => {
    const track = trackOf(entry);
    if (!track) {
      notify('这条记录太旧，无法播放');
      return;
    }
    playerController.playTrack(track, replayable.length ? replayable : undefined);
  };

  const handleClear = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    clearPlayLog();
    setConfirming(false);
    notify('播放历史已清空');
  };

  /**
   * The log is the only record of what was actually listened to and it lives on
   * one device, so it is offered in both a spreadsheet format and one a script
   * can rebuild a playlist from.
   */
  const handleExport = async (format: 'csv' | 'json') => {
    if (exporting) return;
    setExporting(true);
    try {
      const text = format === 'csv' ? toPlayLogCsv(ordered) : toPlayLogJson(ordered);
      const type = format === 'csv' ? 'text/csv' : 'application/json';
      await saveFile(
        new Blob([text], { type: type + ';charset=utf-8' }),
        playLogFileName(format),
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="history-page">
      <div className="history-head">
        <div>
          <div className="history-head__title">播放历史</div>
          <div className="history-head__sub">
            {ordered.length ? '共 ' + ordered.length + ' 条记录' : '还没有播放记录'}
          </div>
        </div>
        <div className="history-head__actions">
          {replayable.length ? (
            <button
              className="am-btn am-btn--secondary am-btn--sm"
              onClick={() => playerController.playTracks(replayable)}
            >
              <Icon name="play" size={14} />
              播放全部
            </button>
          ) : null}
          {ordered.length ? (
            <button
              className="am-btn am-btn--secondary am-btn--sm"
              disabled={exporting}
              onClick={() => void handleExport('csv')}
            >
              <Icon name="download" size={14} />
              导出 CSV
            </button>
          ) : null}
          {ordered.length ? (
            <button
              className="am-btn am-btn--secondary am-btn--sm"
              disabled={exporting}
              onClick={() => void handleExport('json')}
            >
              <Icon name="download" size={14} />
              导出 JSON
            </button>
          ) : null}
          {ordered.length ? (
            <button
              className={'am-btn am-btn--sm ' + (confirming ? 'am-btn--danger' : 'am-btn--ghost')}
              onClick={handleClear}
              onBlur={() => setConfirming(false)}
            >
              {confirming ? '确认清空？' : '清空'}
            </button>
          ) : null}
        </div>
      </div>

      {ordered.length === 0 ? (
        <EmptyState
          icon="clock"
          title="暂无播放记录"
          description="播放过的歌曲会自动出现在这里"
        />
      ) : (
        groups.map((group) => (
          <section key={group.label} className="history-group">
            <div className="history-group__label">{group.label}</div>
            <div className="history-list">
              {group.items.map((entry, index) => {
                const track = trackOf(entry);
                return (
                  <button
                    key={entry.key + '-' + entry.ts + '-' + index}
                    className="history-row"
                    onClick={() => playFrom(entry)}
                  >
                    <div className="history-row__cover">
                      {track ? (
                        <TrackCover track={track} radius="8px" />
                      ) : (
                        <Icon name="music" size={16} />
                      )}
                    </div>
                    <div className="history-row__body">
                      <div className="history-row__name">
                        {entry.name || '未知歌曲'}
                        {track ? <SourceBadge source={track.source} /> : null}
                      </div>
                      <div className="history-row__artist">{entry.artist || '未知歌手'}</div>
                    </div>
                    <div className="history-row__time">{timeLabel(entry.ts)}</div>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
