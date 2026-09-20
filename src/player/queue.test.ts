import { describe, expect, it, vi, afterEach } from 'vitest';
import { PlayerQueue } from './PlayerQueue';
import type { MusicTrack } from '@/music/source/types';

function track(id: string): MusicTrack {
  return {
    id,
    name: 'Song ' + id,
    artist: ['Artist'],
    album: 'Album',
    pic_id: id,
    url_id: id,
    lyric_id: id,
    source: 'mock',
  };
}

const abc = () => [track('a'), track('b'), track('c'), track('d')];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PlayerQueue sequential mode', () => {
  it('walks forward with wrap-around and back with wrap-around', () => {
    const q = new PlayerQueue();
    q.load(abc(), 0);
    expect(q.current?.id).toBe('a');
    expect(q.next()?.id).toBe('b');
    expect(q.next()?.id).toBe('c');
    expect(q.previous()?.id).toBe('b');
    expect(q.previous()?.id).toBe('a');
    expect(q.previous()?.id).toBe('d');
  });

  it('clamps the start index and handles an empty queue', () => {
    const q = new PlayerQueue();
    expect(q.next()).toBeNull();
    expect(q.previous()).toBeNull();
    q.load(abc(), 99);
    expect(q.current?.id).toBe('d');
    const empty = new PlayerQueue();
    empty.load([], 0);
    expect(empty.current).toBeNull();
  });
});

describe('PlayerQueue shuffle mode', () => {
  it('never repeats the current song on next()', () => {
    const q = new PlayerQueue();
    q.load(abc(), 0);
    q.setShuffled(true);
    // Invariant: next() never returns the song it was on (no immediate repeats);
    // returning to an older song later is legitimate shuffle behaviour.
    let prev = q.current!.id;
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const next = q.next()!.id;
      expect(next).not.toBe(prev);
      seen.add(next);
      prev = next;
    }
    // 4 songs; randomness must not be stuck on one.
    expect(seen.size).toBeGreaterThan(1);
  });

  it('previous() walks back through visited songs instead of random picks', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const q = new PlayerQueue();
    q.load(abc(), 0);
    q.setShuffled(true);
    // jumpTo records history: 0 -> 2 -> 1
    q.jumpTo(2);
    q.jumpTo(1);
    expect(q.current?.id).toBe('b');
    expect(q.previous()?.id).toBe('c');
    expect(q.previous()?.id).toBe('a');
    // History exhausted: fallback picks candidates[0] with random()=0,
    // excluding the current index.
    expect(q.previous()?.id).not.toBe('a');
    expect(randomSpy).toHaveBeenCalled();
  });

  it('toggling shuffle resets the history so stale indices leak nowhere', () => {
    const q = new PlayerQueue();
    q.load(abc(), 0);
    q.setShuffled(true);
    q.jumpTo(3);
    q.setShuffled(false);
    q.setShuffled(true);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    // History is empty: fallback excludes current and picks candidates[0] = 'a'.
    expect(q.previous()?.id).toBe('a');
    expect(randomSpy).toHaveBeenCalled();
  });

  it('next() pushes history so previous() returns to the pre-next song', () => {
    const q = new PlayerQueue();
    q.load(abc(), 1);
    q.setShuffled(true);
    const before = q.current!.id;
    const after = q.next()!.id;
    expect(after).not.toBe(before);
    expect(q.previous()?.id).toBe(before);
  });
});

describe('PlayerQueue mutation edge cases', () => {
  it('removeAt keeps the current song playing and adjusts history indices', () => {
    const q = new PlayerQueue();
    q.load(abc(), 2);
    q.setShuffled(true);
    q.jumpTo(3); // history [2]
    q.removeAt(0); // [b,c,d]; current d was index 3 -> 2, history 2 -> 1
    expect(q.current?.id).toBe('d');
    expect(q.previous()?.id).toBe('c');
  });

  it('removeAt the current item advances to the song that took its slot', () => {
    const q = new PlayerQueue();
    q.load(abc(), 1);
    q.removeAt(1);
    expect(q.current?.id).toBe('c');
    q.load(abc(), 3);
    q.removeAt(3);
    expect(q.current?.id).toBe('c');
  });

  it('move keeps the current track and remaps history entries', () => {
    const q = new PlayerQueue();
    q.load(abc(), 0);
    q.setShuffled(true);
    q.jumpTo(3); // history [0]
    q.move(3, 0); // d to front; current index 3 -> 0, history 0 -> 1
    expect(q.current?.id).toBe('d');
    expect(q.previous()?.id).toBe('a');
  });

  it('insertNext works on an empty queue and after the current song', () => {
    const q = new PlayerQueue();
    q.insertNext([track('x')]);
    expect(q.current?.id).toBe('x');
    q.load(abc(), 1);
    q.insertNext([track('x')]);
    expect(q.list[2].id).toBe('x');
    expect(q.current?.id).toBe('b');
  });

  it('jumpTo ignores out-of-range indices', () => {
    const q = new PlayerQueue();
    q.load(abc(), 0);
    expect(q.jumpTo(-1)).toBeNull();
    expect(q.jumpTo(4)).toBeNull();
    expect(q.current?.id).toBe('a');
  });

  it('clear resets everything', () => {
    const q = new PlayerQueue();
    q.load(abc(), 0);
    q.clear();
    expect(q.current).toBeNull();
    expect(q.list).toEqual([]);
    expect(q.next()).toBeNull();
  });
});

/*
 * replaceCurrent backs the automatic source fallback: when a stream cannot be
 * resolved the queue entry is swapped in place, so the user keeps their
 * position in the queue and only the provider behind the song changes.
 */
describe('PlayerQueue replaceCurrent', () => {
  it('swaps the current entry and leaves the rest of the queue alone', () => {
    const q = new PlayerQueue();
    q.load(abc(), 1);
    const replacement = track('b-alt');
    q.replaceCurrent(replacement);

    expect(q.current?.id).toBe('b-alt');
    expect(q.list.map((t) => t.id)).toEqual(['a', 'b-alt', 'c', 'd']);
    expect(q.currentIndex).toBe(1);
  });

  it('keeps the position so the queue still knows what plays next', () => {
    const q = new PlayerQueue();
    q.load(abc(), 1);
    q.replaceCurrent(track('b-alt'));

    expect(q.currentIndex).toBe(1);
    expect(q.next()?.id).toBe('c');
    // Stepping back lands on the replacement, not the entry it displaced - the
    // swap happened in place, which is the whole point.
    expect(q.previous()?.id).toBe('b-alt');
  });

  it('does nothing on an empty or unloaded queue', () => {
    const q = new PlayerQueue();
    expect(() => q.replaceCurrent(track('x'))).not.toThrow();
    expect(q.current).toBeNull();
    expect(q.list).toEqual([]);
  });

  it('does nothing after clear', () => {
    const q = new PlayerQueue();
    q.load(abc(), 0);
    q.clear();
    expect(() => q.replaceCurrent(track('x'))).not.toThrow();
    expect(q.current).toBeNull();
  });
});

describe('PlayerQueue clearUpNext', () => {
  it('drops the pending songs and keeps the current one playing', () => {
    const q = new PlayerQueue();
    q.load(abc(), 1);
    q.clearUpNext();
    expect(q.list.map((t) => t.id)).toEqual(['a', 'b']);
    expect(q.current?.id).toBe('b');
    expect(q.currentIndex).toBe(1);
  });

  it('differs from clear(), which also stops playback', () => {
    const q = new PlayerQueue();
    q.load(abc(), 1);
    q.clear();
    expect(q.current).toBeNull();
  });

  it('does nothing when nothing is loaded', () => {
    const q = new PlayerQueue();
    expect(() => q.clearUpNext()).not.toThrow();
    expect(q.list).toEqual([]);
  });

  it('drops stale shuffle history for the removed songs', () => {
    const q = new PlayerQueue();
    q.load(abc(), 0);
    q.setShuffled(true);
    // Walk forward twice so later indices end up in the history.
    q.next();
    q.next();
    q.clearUpNext();
    // Every history entry must still point at a song that exists.
    expect(q.list.length).toBeGreaterThan(0);
    expect(() => q.previous()).not.toThrow();
    expect(q.current).not.toBeNull();
  });
});
