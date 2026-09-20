// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCachedCards } from './cache';
import type { MusicTrack } from '@/music/source/types';

/**
 * The orchestration in analyzeTrack - resolve, download, decode, analyse, cache -
 * had no coverage, and neither did the channel mixing inside decode, which is
 * real arithmetic that could quietly be wrong.
 *
 * jsdom has no AudioContext, so a stand-in is installed that returns a buffer
 * with known samples. That makes the assertions about the decoded signal
 * checkable rather than assumed.
 */

const SR = 22050;
const SECONDS = 1;
const SAMPLES = SR * SECONDS;

/** Stereo buffer: left is a 220 Hz tone at 0.4, right at 0.2. */
class FakeAudioBuffer {
  numberOfChannels = 2;
  length = SAMPLES;
  sampleRate = SR;
  getChannelData(channel: number): Float32Array {
    const amp = channel === 0 ? 0.4 : 0.2;
    const out = new Float32Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i += 1) out[i] = amp * Math.sin((2 * Math.PI * 220 * i) / SR);
    return out;
  }
}

class FakeAudioContext {
  sampleRate = SR;
  async decodeAudioData(): Promise<FakeAudioBuffer> {
    return new FakeAudioBuffer();
  }
  async close(): Promise<void> {
    /* nothing to release */
  }
}

const resolveTrackUrl = vi.fn();
vi.mock('@/music/source/track-resolver', () => ({
  resolveTrackUrl: (...args: unknown[]) => resolveTrackUrl(...args),
}));

const { analyzeTrack } = await import('./analyzeTrack');

function track(id: string): MusicTrack {
  return {
    id,
    name: 'Song ' + id,
    artist: ['Artist'],
    album: 'Album',
    pic_id: 'p',
    url_id: 'u',
    lyric_id: 'l',
    source: 'mock',
  };
}

/** Byte payload is irrelevant: the fake decoder ignores it. */
function stubFetch(ok = true) {
  const spy = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 503,
    arrayBuffer: async () => new ArrayBuffer(64),
  }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await clearCachedCards();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  resolveTrackUrl.mockResolvedValue('https://cdn.example.com/song.mp3');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('analyzeTrack pipeline', () => {
  it('produces a fact card for a track that resolves', async () => {
    stubFetch();
    const card = await analyzeTrack(track('t1'));
    expect(card).not.toBeNull();
    expect(card!.trackKey).toContain('t1');
    expect(card!.version).toBeGreaterThan(0);
  });

  it('mixes stereo to mono by averaging the channels', async () => {
    stubFetch();
    const card = await analyzeTrack(track('t2'));
    // Left 0.4 + right 0.2 averaged = 0.3 amplitude, whose RMS is 0.3/sqrt(2)
    // = 0.212, i.e. about -13.5 dB. Summing without dividing would give 0.6
    // amplitude (-7.5 dB), so the two are far apart and this pins the division.
    expect(card!.dynamics.peakDb).toBeGreaterThan(-15);
    expect(card!.dynamics.peakDb).toBeLessThan(-12);
  });

  it('finds the 220 Hz tone we put in', async () => {
    stubFetch();
    const card = await analyzeTrack(track('t3'));
    // 220 Hz sits in the low band, so low should dominate.
    expect(card!.bands.low).toBeGreaterThan(card!.bands.high);
    expect(card!.timbre.centroidHz).toBeLessThan(2000);
  });

  it('serves the second call from cache without downloading again', async () => {
    const fetchSpy = stubFetch();
    await analyzeTrack(track('t4'));
    const callsAfterFirst = fetchSpy.mock.calls.length;
    const again = await analyzeTrack(track('t4'));
    expect(again).not.toBeNull();
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it('re-analyses when force is set', async () => {
    const fetchSpy = stubFetch();
    await analyzeTrack(track('t5'));
    const callsAfterFirst = fetchSpy.mock.calls.length;
    await analyzeTrack(track('t5'), { force: true });
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('returns null when no stream can be resolved', async () => {
    resolveTrackUrl.mockResolvedValue(null);
    stubFetch();
    // Must be null rather than a fabricated card: callers rely on null meaning
    // "no facts available".
    expect(await analyzeTrack(track('t6'))).toBeNull();
  });

  it('falls back to the media proxy when the direct fetch fails', async () => {
    const spy = vi.fn(async (url: string) => {
      if (String(url).includes('/api/media-proxy')) {
        return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(64) };
      }
      throw new Error('blocked by CORS');
    });
    vi.stubGlobal('fetch', spy);
    const card = await analyzeTrack(track('t7'));
    expect(card).not.toBeNull();
    expect(spy.mock.calls.some((c) => String(c[0]).includes('/api/media-proxy'))).toBe(true);
  });

  it('returns null when the proxy also fails, rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 502, arrayBuffer: async () => new ArrayBuffer(0) })),
    );
    expect(await analyzeTrack(track('t8'))).toBeNull();
  });

  it('abandons the work when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    stubFetch();
    expect(await analyzeTrack(track('t9'), { signal: controller.signal })).toBeNull();
  });

  it('reports the stage it is in', async () => {
    stubFetch();
    const stages: string[] = [];
    await analyzeTrack(track('t10'), { onStage: (s) => stages.push(s) });
    expect(stages).toEqual(['resolving', 'downloading', 'decoding', 'analyzing']);
  });

  it('returns null when the platform cannot decode', async () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    stubFetch();
    expect(await analyzeTrack(track('t11'))).toBeNull();
  });
});
