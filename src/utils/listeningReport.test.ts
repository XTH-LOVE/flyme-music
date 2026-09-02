import { describe, expect, it } from 'vitest';
import {
  buildListeningReport,
  formatReportDuration,
  rangeLabel,
  rangeStart,
} from './listeningReport';
import type { PlayLogEntry } from '@/store/useLibraryStore';

const log = (key: string, name: string, artist: string, ts: number, duration?: number): PlayLogEntry => ({
  key,
  name,
  artist,
  ts,
  track: {
    id: key.split(':')[1] ?? key,
    name,
    artist: artist.split('/').map((s) => s.trim()),
    album: '',
    pic_id: '',
    url_id: '',
    lyric_id: '',
    source: 'netease',
    duration,
  },
});

const NOW = Date.parse('2026-09-04T10:00:00');

describe('rangeStart', () => {
  it('week = 7 days back', () => {
    const s = rangeStart(NOW, 'week');
    expect(NOW - s).toBe(7 * 24 * 60 * 60 * 1000);
  });
  it('month = first of the month', () => {
    const d = new Date(rangeStart(NOW, 'month'));
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(8); // September
  });
  it('year = Jan 1 of the year', () => {
    const d = new Date(rangeStart(NOW, 'year'));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });
});

describe('buildListeningReport', () => {
  it('filters plays to the range', () => {
    const playLog = [
      log('n:1', 'a', '周杰伦', NOW - 1000),
      log('n:2', 'b', '林俊杰', NOW - 20 * 24 * 60 * 60 * 1000), // older than a week
    ];
    const r = buildListeningReport(playLog, 'week', NOW);
    expect(r.total).toBe(1);
    expect(r.distinctSongs).toBe(1);
  });

  it('counts distinct artists and active days', () => {
    const playLog = [
      log('n:1', 'a', '周杰伦', NOW - 1000),
      log('n:2', 'b', '周杰伦', NOW - 2000),
      log('n:3', 'c', '林俊杰', NOW - 2 * 24 * 60 * 60 * 1000),
    ];
    const r = buildListeningReport(playLog, 'month', NOW);
    expect(r.distinctArtists).toBe(2);
    expect(r.activeDays).toBe(2);
    expect(r.topArtists[0].name).toBe('周杰伦');
  });

  it('estimates total seconds from track durations', () => {
    const playLog = [
      log('n:1', 'a', '周杰伦', NOW - 1000, 180),
      log('n:2', 'b', '周杰伦', NOW - 2000, 120),
    ];
    const r = buildListeningReport(playLog, 'week', NOW);
    expect(r.estimatedSeconds).toBe(300);
  });

  it('ignores entries without duration in the estimate', () => {
    const playLog = [log('n:1', 'a', '周杰伦', NOW - 1000)];
    expect(buildListeningReport(playLog, 'week', NOW).estimatedSeconds).toBe(0);
  });
});

describe('rangeLabel', () => {
  it('labels week/month/year', () => {
    expect(rangeLabel('week', NOW)).toBe('本周');
    expect(rangeLabel('month', NOW)).toBe('2026 年 9 月');
    expect(rangeLabel('year', NOW)).toBe('2026 年度');
  });
});

describe('formatReportDuration', () => {
  it('formats seconds/minutes/hours', () => {
    expect(formatReportDuration(30)).toBe('30 秒');
    expect(formatReportDuration(90)).toBe('1 分钟');
    expect(formatReportDuration(3600)).toBe('1 小时');
    expect(formatReportDuration(4500)).toBe('1 小时 15 分钟');
  });
});
