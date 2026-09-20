import { describe, expect, it } from 'vitest';
import {
  analyzeListening,
  filterCandidates,
  isDisliked,
  knownTrackKeys,
  norm,
  scoreCandidate,
  splitArtists,
  type DailyPickInput,
} from './dailyPick';
import type { PlayLogEntry } from '@/store/useLibraryStore';
import type { MusicTrack } from '@/music/source/types';

const log = (key: string, name: string, artist: string, ts: number): PlayLogEntry => ({
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
  },
});

const track = (id: string, name: string, artist: string): MusicTrack => ({
  id,
  name,
  artist: [artist],
  album: '',
  pic_id: '',
  url_id: '',
  lyric_id: '',
  source: 'netease',
});

const BASE: DailyPickInput = {
  playLog: [],
  favorites: [],
  dislikes: [],
  now: Date.parse('2026-09-04T10:00:00'),
};

describe('norm', () => {
  it('lowercases and strips punctuation/whitespace', () => {
    expect(norm('周杰伦 / 林俊杰')).toBe('周杰伦林俊杰');
    expect(norm('Taylor Swift（Live）')).toBe('taylorswiftlive');
  });
});

describe('isDisliked', () => {
  it('matches an artist name exactly', () => {
    expect(isDisliked('周杰伦', ['周杰伦'])).toBe(true);
  });
  it('matches a keyword contained in the text', () => {
    expect(isDisliked('周杰伦 - 晴天', ['晴天'])).toBe(true);
  });
  it('ignores case and punctuation', () => {
    expect(isDisliked('Taylor Swift', ['taylor swift'])).toBe(true);
  });
  it('returns false with no dislikes', () => {
    expect(isDisliked('xx', [])).toBe(false);
  });
});

describe('splitArtists', () => {
  it('splits on slash and trims', () => {
    expect(splitArtists('周杰伦 / 林俊杰')).toEqual(['周杰伦', '林俊杰']);
  });
});

describe('analyzeListening', () => {
  const now = BASE.now!;
  it('ranks artists by recent play count', () => {
    const input: DailyPickInput = {
      ...BASE,
      playLog: [
        log('n:1', '七里香', '周杰伦', now),
        log('n:2', '晴天', '周杰伦', now - 1000),
        log('n:3', '江南', '林俊杰', now - 2000),
      ],
    };
    const signals = analyzeListening(input);
    expect(signals.topArtists[0]).toBe('周杰伦');
    expect(signals.topArtists[1]).toBe('林俊杰');
  });

  it('excludes disliked artists', () => {
    const input: DailyPickInput = {
      ...BASE,
      dislikes: ['周杰伦'],
      playLog: [
        log('n:1', '七里香', '周杰伦', now),
        log('n:2', '江南', '林俊杰', now - 1000),
      ],
    };
    const signals = analyzeListening(input);
    expect(signals.topArtists).toEqual(['林俊杰']);
  });

  it('ignores plays older than the window', () => {
    const input: DailyPickInput = {
      ...BASE,
      playLog: [log('n:1', '七里香', '周杰伦', now - 40 * 24 * 60 * 60 * 1000)],
    };
    expect(analyzeListening(input).topArtists).toEqual([]);
  });

  it('returns ranked queries from top artists', () => {
    const input: DailyPickInput = {
      ...BASE,
      playLog: [
        log('n:1', 'a', '周杰伦', now),
        log('n:2', 'b', '周杰伦', now - 1000),
        log('n:3', 'c', '林俊杰', now - 2000),
      ],
    };
    const { queries } = analyzeListening(input);
    expect(queries[0]).toEqual({ query: '周杰伦', weight: 2 });
    expect(queries[1]).toEqual({ query: '林俊杰', weight: 1 });
  });
});

describe('filterCandidates / scoreCandidate', () => {
  const known = knownTrackKeys([log('netease:9', '旧歌', '某歌手', 1)]);
  const dislikes = ['周杰伦'];

  it('drops disliked tracks', () => {
    expect(filterCandidates([track('1', '七里香', '周杰伦')], known, dislikes)).toEqual([]);
  });

  it('drops already-known tracks', () => {
    const withKnown = new Set(['netease:9']);
    expect(filterCandidates([track('9', '旧歌', '某歌手')], withKnown, dislikes)).toEqual([]);
  });

  it('keeps a fresh, non-disliked track', () => {
    const ts = filterCandidates([track('2', '江南', '林俊杰')], known, dislikes);
    expect(ts).toHaveLength(1);
    expect(ts[0].id).toBe('2');
  });

  it('scoreCandidate returns -1 for skipped, 1 for accepted', () => {
    expect(scoreCandidate(track('2', '江南', '林俊杰'), known, dislikes)).toBe(1);
    expect(scoreCandidate(track('x', '七里香', '周杰伦'), known, dislikes)).toBe(-1);
  });
});
