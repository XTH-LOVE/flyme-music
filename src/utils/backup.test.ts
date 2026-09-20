import { describe, expect, it } from 'vitest';
import { BACKUP_APP, BACKUP_VERSION, backupFileName, buildBackup, parseBackup } from './backup';
import type { MusicTrack } from '@/music/source/types';

const tr = (id: string): MusicTrack => ({
  id,
  name: 'song ' + id,
  artist: ['artist'],
  album: '',
  pic_id: '',
  url_id: '',
  lyric_id: '',
  source: 'netease',
});

describe('buildBackup', () => {
  it('stamps app + schema and copies arrays', () => {
    const b = buildBackup({
      favorites: ['1', '2'],
      recentTracks: [tr('1')],
      playLog: [],
      dislikes: ['周杰伦'],
      playlists: [],
    });
    expect(b.app).toBe(BACKUP_APP);
    expect(b.schema).toBe(BACKUP_VERSION);
    expect(b.favorites).toEqual(['1', '2']);
    expect(b.dislikes).toEqual(['周杰伦']);
    expect(b.recentTracks).toHaveLength(1);
  });

  it('defaults missing arrays to empty', () => {
    const b = buildBackup({});
    expect(b.favorites).toEqual([]);
    expect(b.playlists).toEqual([]);
  });
});

describe('backupFileName', () => {
  it('produces a dated json filename', () => {
    const name = backupFileName(new Date('2026-09-04T10:00:00'));
    expect(name).toBe('aurora-backup-20260904.json');
  });
});

describe('parseBackup', () => {
  it('rejects foreign payloads', () => {
    expect(parseBackup({ app: 'other' })).toBeNull();
    expect(parseBackup(null)).toBeNull();
    expect(parseBackup('x')).toBeNull();
  });

  it('accepts the legacy pre-rename app marker', () => {
    const parsed = parseBackup({ app: 'flyme-music', favorites: ['1'] });
    expect(parsed).not.toBeNull();
    expect(parsed!.app).toBe(BACKUP_APP);
    expect(parsed!.favorites).toEqual(['1']);
  });

  it('round-trips a valid backup', () => {
    const b = buildBackup({
      favorites: ['1'],
      recentTracks: [tr('1')],
      playLog: [{ key: 'netease:1', name: 'song 1', artist: 'artist', ts: 1, track: tr('1') }],
      dislikes: ['x'],
      playlists: [{ id: 'pl-1', name: 'My', tracks: [tr('1')], createdAt: 1, update_time: 1 }],
    });
    const parsed = parseBackup(JSON.parse(JSON.stringify(b)));
    expect(parsed).not.toBeNull();
    expect(parsed!.favorites).toEqual(['1']);
    expect(parsed!.playlists).toHaveLength(1);
    expect(parsed!.playLog[0].key).toBe('netease:1');
  });

  it('coerces malformed array fields to empty arrays', () => {
    const parsed = parseBackup({ app: 'aurora-music', favorites: 'nope', dislikes: 42 });
    expect(parsed!.favorites).toEqual([]);
    expect(parsed!.dislikes).toEqual([]);
  });
});
