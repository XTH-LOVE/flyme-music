import type { PlayLogEntry } from '@/store/useLibraryStore';

/**
 * Listening-report aggregation (pure, unit-testable).
 *
 * Produces a compact "report" over a time range: total plays, distinct songs,
 * artists, active days, and ranked top lists. It does not phone home and works
 * entirely from the local playLog.
 */

export type ReportRange = 'week' | 'month' | 'year';

export interface ListeningReport {
  range: ReportRange;
  start: number;
  end: number;
  total: number;
  distinctSongs: number;
  distinctArtists: number;
  activeDays: number;
  topSongs: { key: string; name: string; artist: string; count: number }[];
  topArtists: { name: string; count: number }[];
  /** Estimated listen seconds, from track durations where available. */
  estimatedSeconds: number;
}

export function rangeStart(now: number, range: ReportRange): number {
  const d = new Date(now);
  if (range === 'week') {
    return now - 7 * 24 * 60 * 60 * 1000;
  }
  if (range === 'month') {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  d.setMonth(0);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function rangeLabel(range: ReportRange, now: number): string {
  const d = new Date(now);
  if (range === 'week') return '本周';
  if (range === 'month') return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月';
  return d.getFullYear() + ' 年度';
}

export function buildListeningReport(
  playLog: PlayLogEntry[],
  range: ReportRange,
  now = Date.now(),
): ListeningReport {
  const start = rangeStart(now, range);
  const end = now;

  const plays = playLog.filter((e) => e.ts >= start && e.ts < end);

  const songCount = new Map<string, { name: string; artist: string; count: number }>();
  const artistCount = new Map<string, number>();
  const days = new Set<string>();
  let estimatedSeconds = 0;

  for (const e of plays) {
    const d = new Date(e.ts);
    days.add(
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
    );
    const existing = songCount.get(e.key) ?? { name: e.name, artist: e.artist, count: 0 };
    existing.count += 1;
    songCount.set(e.key, existing);
    for (const a of e.artist.split('/').map((x) => x.trim()).filter(Boolean)) {
      artistCount.set(a, (artistCount.get(a) ?? 0) + 1);
    }
    if (e.track?.duration) estimatedSeconds += e.track.duration;
  }

  const topSongs = [...songCount.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topArtists = [...artistCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    range,
    start,
    end,
    total: plays.length,
    distinctSongs: songCount.size,
    distinctArtists: artistCount.size,
    activeDays: days.size,
    topSongs,
    topArtists,
    estimatedSeconds,
  };
}

/** Human-readable duration like "12 小时 30 分钟". */
export function formatReportDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return s + ' 秒';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' 分钟';
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? h + ' 小时 ' + rem + ' 分钟' : h + ' 小时';
}
