import { useMemo, useState } from 'react';
import { useLibraryStore, type PlayLogEntry } from '@/store/useLibraryStore';
import './listening-report.css';

/**
 * The listening report - a narrative summary rather than another row of totals.
 *
 * StatsPage already counts things. What it cannot do is say what the counts
 * mean, and that is the whole appeal of the format: "you listened for 43 hours"
 * is a number, "you listened for 43 hours, most of it after eleven at night" is
 * something you send to a friend.
 *
 * Every figure comes from `playLog`, which has been recorded all along - this
 * adds no tracking, it just reads what is already there.
 */

type Range = '30d' | 'year' | 'all';

const RANGES: { key: Range; label: string }[] = [
  { key: '30d', label: '最近 30 天' },
  { key: 'year', label: '今年' },
  { key: 'all', label: '全部' },
];

interface Ranked {
  label: string;
  count: number;
}

interface Report {
  plays: number;
  /** Distinct tracks, which is the honest reading of "how many songs". */
  songs: number;
  hours: number;
  topArtists: Ranked[];
  topSongs: Ranked[];
  /** Hour of day with the most plays, or null when the log is empty. */
  peakHour: number | null;
  nightShare: number;
  bestDay: { date: string; count: number } | null;
}

function cutoffOf(range: Range): number {
  if (range === '30d') return Date.now() - 30 * 86_400_000;
  if (range === 'year') return new Date(new Date().getFullYear(), 0, 1).getTime();
  return 0;
}

function rank(entries: PlayLogEntry[], pick: (e: PlayLogEntry) => string): Ranked[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = pick(entry).trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function build(entries: PlayLogEntry[]): Report {
  if (!entries.length) {
    return {
      plays: 0, songs: 0, hours: 0,
      topArtists: [], topSongs: [], peakHour: null, nightShare: 0, bestDay: null,
    };
  }

  const byHour = new Array(24).fill(0) as number[];
  const byDay = new Map<string, number>();
  const songs = new Set<string>();
  // A play is not a known duration - the log records starts, not ends - so the
  // estimate is a fixed 3.5 minutes per play. Stated in the UI rather than
  // quietly presented as a measurement.
  const plays = entries.length;
  let night = 0;

  for (const entry of entries) {
    const at = new Date(entry.ts);
    const hour = at.getHours();
    byHour[hour] += 1;
    // 23:00-05:00, which is the range a listener would recognise as "late".
    if (hour >= 23 || hour < 5) night += 1;
    songs.add(entry.key || entry.name + '|' + entry.artist);
    const day = at.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  const peakHour = byHour.indexOf(Math.max(...byHour));
  const bestEntry = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    plays,
    songs: songs.size,
    hours: (plays * 3.5) / 60,
    topArtists: rank(entries, (e) => e.artist.split(' / ')[0] ?? ''),
    topSongs: rank(entries, (e) => e.name),
    peakHour,
    nightShare: night / plays,
    bestDay: bestEntry ? { date: bestEntry[0], count: bestEntry[1] } : null,
  };
}

/** A sentence, not a label. The summary is the part worth reading aloud. */
function summarise(report: Report, range: Range): string {
  if (!report.plays) return '还没有足够的记录。听几首歌再回来。';
  const span = range === '30d' ? '这 30 天' : range === 'year' ? '今年' : '至今';
  const head = span + '你听了 ' + report.songs + ' 首歌，共 ' + Math.round(report.hours) + ' 小时。';

  if (report.nightShare >= 0.35 && report.peakHour !== null) {
    return head + '其中 ' + Math.round(report.nightShare * 100) + '% 在深夜——' + report.peakHour + ' 点是你最常按播放的时刻。';
  }
  if (report.topArtists[0]) {
    return head + '听得最多的是 ' + report.topArtists[0].label + '。';
  }
  return head;
}

export function ListeningReport() {
  const playLog = useLibraryStore((s) => s.playLog);
  const [range, setRange] = useState<Range>('30d');

  const report = useMemo(
    () => build(playLog.filter((e) => e.ts >= cutoffOf(range))),
    [playLog, range],
  );

  return (
    <section className="report">
      <div className="report__head">
        <h2 className="report__title">听歌报告</h2>
        <div className="report__ranges" role="tablist">
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={range === r.key}
              className={'report__range' + (range === r.key ? ' report__range--on' : '')}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <p className="report__summary">{summarise(report, range)}</p>

      {report.plays > 0 ? (
        <>
          <div className="report__grid">
            <div className="report__stat">
              <span className="report__stat-value">{report.plays.toLocaleString()}</span>
              <span className="report__stat-label">播放次数</span>
            </div>
            <div className="report__stat">
              <span className="report__stat-value">{Math.round(report.hours)}</span>
              <span className="report__stat-label">小时（估算）</span>
            </div>
            <div className="report__stat">
              <span className="report__stat-value">{report.peakHour ?? '—'}</span>
              <span className="report__stat-label">最常听歌的时刻</span>
            </div>
            <div className="report__stat">
              <span className="report__stat-value">{Math.round(report.nightShare * 100)}%</span>
              <span className="report__stat-label">深夜占比</span>
            </div>
          </div>

          <div className="report__lists">
            <ReportList title="最常听的歌手" items={report.topArtists} unit="次" />
            <ReportList title="最常听的歌" items={report.topSongs} unit="次" />
          </div>

          {report.bestDay ? (
            <p className="report__footnote">
              最投入的一天是 {report.bestDay.date}，那天你按了 {report.bestDay.count} 次播放。
              <br />
              时长按每次 3.5 分钟估算——记录里只有播放开始时间，没有结束时间。
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ReportList({ title, items, unit }: { title: string; items: Ranked[]; unit: string }) {
  if (!items.length) return null;
  const max = items[0].count;
  return (
    <div className="report__list">
      <h3 className="report__list-title">{title}</h3>
      <ol className="report__items">
        {items.map((item, index) => (
          <li key={item.label} className="report__item">
            <span className="report__item-rank">{index + 1}</span>
            <span className="report__item-label">{item.label}</span>
            <span className="report__item-bar" aria-hidden="true">
              {/* Width, not colour, carries the comparison: a row of tinted bars
                  is harder to read at a glance than five lengths. */}
              <i style={{ width: Math.round((item.count / max) * 100) + '%' }} />
            </span>
            <span className="report__item-count">
              {item.count} {unit}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
