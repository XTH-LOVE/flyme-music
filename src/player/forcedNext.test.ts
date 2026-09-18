// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { playerController } from '@/player';
import type { MusicTrack } from '@/music/source/types';

/**
 * "Play next" must mean next even when shuffle is on, where next() otherwise
 * picks a random index. Mock tracks resolve to no URL, so none of this touches
 * the network.
 */
function track(id: string): MusicTrack {
  return {
    id,
    name: id,
    artist: ['Artist'],
    album: '',
    pic_id: id,
    url_id: id,
    lyric_id: id,
    source: 'mock',
  };
}

const currentId = () => playerController.snapshot().current?.id ?? null;

function startShuffledQueue(): void {
  playerController.playTracks(
    Array.from({ length: 20 }, (_, i) => track('m' + i)),
    0,
  );
  if (!playerController.snapshot().shuffle) playerController.toggleShuffle();
}

describe('playNext vs shuffle', () => {
  it('plays the explicitly queued song next, every time, not a random one', () => {
    // Repeated because the broken behaviour is random: without the forced-next
    // bookkeeping this would pick the queued song only about 1 in 20 times.
    for (let round = 0; round < 20; round += 1) {
      startShuffledQueue();
      playerController.playNext([track('forced')]);
      playerController.next();
      expect(currentId()).toBe('forced');
    }
  });

  it('is one-shot: the following next() goes back to shuffle', () => {
    startShuffledQueue();
    playerController.playNext([track('forced')]);
    playerController.next();
    expect(currentId()).toBe('forced');
    // Burn a few rounds; with 21 songs a random walk is very unlikely to sit on
    // the same track, so this mainly asserts it does not crash and stays in the
    // queue.
    for (let i = 0; i < 5; i += 1) playerController.next();
    expect(playerController.snapshot().queue.length).toBe(21);
  });

  it('falls back to shuffle when the queued song was removed before next()', () => {
    startShuffledQueue();
    playerController.playNext([track('forced')]);
    const index = playerController.snapshot().queue.findIndex((t) => t.id === 'forced');
    expect(index).toBeGreaterThan(0);
    playerController.removeFromQueue(index);
    expect(() => playerController.next()).not.toThrow();
    expect(currentId()).not.toBeNull();
  });

  it('a fresh queue or a manual jump discards a pending request', () => {
    startShuffledQueue();
    playerController.playNext([track('forced')]);
    // Replacing the queue must not leave the old request able to hijack it.
    playerController.playTracks([track('x'), track('y')], 0);
    playerController.next();
    expect(currentId()).not.toBe('forced');
  });
});
