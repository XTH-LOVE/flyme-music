import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { withStore } from '@/lib/idb';
import { clearCachedCards, listCachedCards, readCachedCard, writeCachedCard } from './cache';
import { FEATURES_VERSION, type FeatureCard } from './types';

/**
 * The cache had no test coverage at all, which meant the claim that "bumping the
 * version invalidates old cards" was untested. fake-indexeddb lets the real
 * withStore path run rather than a mock, so the key layout is actually exercised.
 */

const DB_NAME = 'aurora-analysis';
const DB_VERSION = 1;
const STORE = 'features';

function card(trackKey: string, version = FEATURES_VERSION): FeatureCard {
  return {
    version,
    durationSec: 200,
    analysisRate: 22050,
    bpm: { value: 120, confidence: 0.8 },
    key: { tonic: 0, mode: 'major', confidence: 0.7 },
    dynamics: { peakDb: -8, meanDb: -18, rangeDb: 10, peakAtSec: 60 },
    timbre: { centroidHz: 2000, rolloffHz: 4000, flatness: 0.1, zeroCrossingRate: 0.05 },
    bands: { low: 0.3, mid: 0.5, high: 0.2 },
    energyCurve: [0.2, 0.5, 1],
    onsetDensity: 2,
    sections: [],
    vector: [1, 2, 3],
    trackKey,
    track: {
      id: trackKey,
      name: 'n',
      artist: ['a'],
      album: '',
      pic_id: 'p',
      url_id: 'u',
      lyric_id: 'l',
      source: 'mock',
    },
    name: 'n',
    artist: 'a',
    analyzedAt: 0,
  };
}

/** Write straight to the store, bypassing the version-prefixed key. */
async function writeRaw(key: string, value: FeatureCard): Promise<void> {
  await withStore<unknown>(DB_NAME, DB_VERSION, STORE, 'readwrite', (store) =>
    store.put({ key, card: value }),
  );
}

beforeEach(async () => {
  await clearCachedCards();
});

describe('feature card cache', () => {
  it('round-trips a card', async () => {
    const c = card('t1');
    await writeCachedCard('t1', c);
    const read = await readCachedCard('t1');
    expect(read?.trackKey).toBe('t1');
    expect(read?.bpm.value).toBe(120);
  });

  it('misses for an unknown track', async () => {
    expect(await readCachedCard('nope')).toBeNull();
  });

  it('keeps the original track so a match can be queued', async () => {
    await writeCachedCard('t2', card('t2'));
    const read = await readCachedCard('t2');
    // Without this the similarity result would need a fresh search to play.
    expect(read?.track.id).toBe('t2');
  });

  it('overwrites an existing entry rather than duplicating it', async () => {
    await writeCachedCard('t3', card('t3'));
    const updated = { ...card('t3'), bpm: { value: 90, confidence: 0.9 } };
    await writeCachedCard('t3', updated);
    const all = await listCachedCards();
    expect(all.filter((c) => c.trackKey === 't3')).toHaveLength(1);
    expect((await readCachedCard('t3'))?.bpm.value).toBe(90);
  });

  it('lists every cached card', async () => {
    await writeCachedCard('a', card('a'));
    await writeCachedCard('b', card('b'));
    const all = await listCachedCards();
    expect(all.map((c) => c.trackKey).sort()).toEqual(['a', 'b']);
  });

  it('ignores cards written by an older extractor version', async () => {
    // This is the behaviour the version bump was supposed to guarantee: old
    // analysis must not be mixed with new results.
    await writeRaw(`v${FEATURES_VERSION - 1}:old`, card('old', FEATURES_VERSION - 1));
    await writeRaw(`v${FEATURES_VERSION}:new`, card('new'));

    expect(await readCachedCard('old')).toBeNull(); // key prefix differs
    const all = await listCachedCards();
    expect(all.map((c) => c.trackKey)).toEqual(['new']);
  });

  it('clears everything', async () => {
    await writeCachedCard('x', card('x'));
    await clearCachedCards();
    expect(await listCachedCards()).toEqual([]);
    expect(await readCachedCard('x')).toBeNull();
  });

  it('degrades to a miss rather than throwing when IndexedDB is unavailable', async () => {
    // Private browsing and some webviews reject the open request outright; the
    // caller must still be able to analyse, just without caching.
    const original = globalThis.indexedDB;
    // @ts-expect-error deliberately removing the global for this case
    delete globalThis.indexedDB;
    try {
      expect(await readCachedCard('anything')).toBeNull();
      expect(await listCachedCards()).toEqual([]);
      await expect(writeCachedCard('anything', card('anything'))).resolves.toBeUndefined();
    } finally {
      globalThis.indexedDB = original;
    }
  });
});
