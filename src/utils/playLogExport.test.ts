import { describe, expect, it } from 'vitest';
import {
  PLAY_LOG_COLUMNS,
  localTimestamp,
  playLogFileName,
  toPlayLogCsv,
  toPlayLogJson,
  toRows,
  type PlayLogLike,
} from './playLogExport';

const entry = (over: Partial<PlayLogLike> = {}): PlayLogLike => ({
  key: 'netease:123',
  name: '晴天',
  artist: '周杰伦',
  ts: new Date(2026, 8, 20, 18, 55, 41).getTime(),
  track: { id: '123', source: 'netease', album: '叶惠美' },
  ...over,
});

describe('localTimestamp', () => {
  it('reports local time, not UTC', () => {
    // 23:30 local on the 20th is the 21st in UTC for eastern zones; a UTC
    // timestamp would file the evening's listening under the wrong day.
    expect(localTimestamp(new Date(2026, 8, 20, 23, 30, 5).getTime())).toBe('2026-09-20 23:30:05');
  });

  it('zero-pads every field', () => {
    expect(localTimestamp(new Date(2026, 0, 2, 3, 4, 5).getTime())).toBe('2026-01-02 03:04:05');
  });

  it('is sortable as a string', () => {
    const early = localTimestamp(new Date(2026, 0, 2, 9, 0, 0).getTime());
    const late = localTimestamp(new Date(2026, 0, 10, 9, 0, 0).getTime());
    expect(early < late).toBe(true);
  });
});

describe('toRows', () => {
  it('flattens a full record', () => {
    expect(toRows([entry()])).toEqual([
      {
        time: '2026-09-20 18:55:41',
        name: '晴天',
        artist: '周杰伦',
        album: '叶惠美',
        source: 'netease',
        id: '123',
      },
    ]);
  });

  it('falls back to the key prefix for records with no track snapshot', () => {
    // Older log rows only carry `source:id`.
    const rows = toRows([entry({ track: undefined })]);
    expect(rows[0].source).toBe('netease');
    expect(rows[0].id).toBe('123');
    expect(rows[0].album).toBe('');
  });

  it('does not invent a source for a malformed key', () => {
    const rows = toRows([entry({ key: 'no-colon', track: undefined })]);
    expect(rows[0].source).toBe('');
    expect(rows[0].id).toBe('');
  });
});

describe('toPlayLogCsv', () => {
  it('writes the header and one line per play', () => {
    const csv = toPlayLogCsv([entry(), entry({ name: '稻香' })]);
    const lines = csv.replace('\uFEFF', '').trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(PLAY_LOG_COLUMNS.join(','));
    expect(lines[1]).toContain('晴天');
    expect(lines[2]).toContain('稻香');
  });

  it('leads with a BOM so Excel reads the Chinese columns', () => {
    expect(toPlayLogCsv([entry()]).startsWith('\uFEFF')).toBe(true);
  });

  it('quotes a field containing a comma', () => {
    const csv = toPlayLogCsv([entry({ artist: 'Jay, Chou' })]);
    expect(csv).toContain('"Jay, Chou"');
  });

  it('escapes a quote by doubling it', () => {
    const csv = toPlayLogCsv([entry({ name: 'He said "hi"' })]);
    expect(csv).toContain('"He said ""hi"""');
  });

  it('quotes a field containing a newline rather than breaking the row', () => {
    const csv = toPlayLogCsv([entry({ name: 'line1\nline2' })]);
    expect(csv).toContain('"line1\nline2"');
    // Two records worth of structure: the header and the one quoted row.
    expect(csv.replace('\uFEFF', '').trim().split('\r\n')).toHaveLength(2);
  });

  it('still writes a header for an empty log', () => {
    expect(toPlayLogCsv([])).toBe('\uFEFF' + PLAY_LOG_COLUMNS.join(',') + '\r\n');
  });
});

describe('toPlayLogJson', () => {
  it('round-trips as JSON with a count', () => {
    const parsed = JSON.parse(toPlayLogJson([entry(), entry()]));
    expect(parsed.count).toBe(2);
    expect(parsed.plays).toHaveLength(2);
    expect(parsed.plays[0].source).toBe('netease');
    expect(typeof parsed.exportedAt).toBe('string');
  });

  it('exports an empty log without throwing', () => {
    expect(JSON.parse(toPlayLogJson([])).plays).toEqual([]);
  });
});

describe('playLogFileName', () => {
  it('carries the date and the extension', () => {
    expect(playLogFileName('csv', new Date(2026, 8, 20).getTime())).toBe(
      'aurora-history-20260920.csv',
    );
  });

  it('zero-pads the month and day', () => {
    expect(playLogFileName('json', new Date(2026, 0, 5).getTime())).toBe(
      'aurora-history-20260105.json',
    );
  });
});
