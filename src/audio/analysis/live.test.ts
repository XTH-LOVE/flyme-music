// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The live path is conditional by nature - it can only read audio that is routed
 * through Web Audio. The thing worth testing is therefore not the happy path but
 * that every unavailable case is *explained*, since a silent zero reading would
 * look exactly like a quiet passage.
 */
const mocks = vi.hoisted(() => ({
  analyser: null as null | FakeAnalyser,
  tainted: false,
  supported: true,
  playing: true,
}));

interface FakeAnalyser {
  fftSize: number;
  frequencyBinCount: number;
  context: { sampleRate: number };
  getFloatFrequencyData: (out: Float32Array) => void;
  getFloatTimeDomainData: (out: Float32Array) => void;
}

vi.mock('@/player/webAudio', () => ({
  getAnalysisAnalyser: () => mocks.analyser,
  isWebAudioTainted: () => mocks.tainted,
  hasWebAudioSupport: () => mocks.supported,
  isWiredElementPlaying: () => mocks.playing,
}));

const { liveStatus, readLiveWindow, describeLiveWindow, resetLiveHistory } = await import('./live');

function makeAnalyser(): FakeAnalyser {
  const bins = 1024;
  return {
    fftSize: 2048,
    frequencyBinCount: bins,
    context: { sampleRate: 44100 },
    getFloatFrequencyData(out) {
      // A tone at ~440 Hz plus a little high-frequency content.
      out.fill(-100);
      const bin = Math.round((440 / 22050) * bins);
      out[bin] = -10;
      out[Math.round((5000 / 22050) * bins)] = -30;
    },
    getFloatTimeDomainData(out) {
      out.fill(0);
      for (let i = 0; i < out.length; i += 1) out[i] = 0.2 * Math.sin((2 * Math.PI * 440 * i) / 44100);
    },
  };
}

beforeEach(() => {
  mocks.analyser = null;
  mocks.tainted = false;
  mocks.supported = true;
  mocks.playing = true;
  resetLiveHistory();
});

describe('liveStatus', () => {
  it('reports unsupported when the platform has no Web Audio', () => {
    mocks.supported = false;
    const status = liveStatus();
    expect(status.available).toBe(false);
    expect(status.reason).toBe('unsupported');
    expect(status.message).toContain('不支持');
  });

  it('reports tainted and tells the user a refresh will retry', () => {
    mocks.supported = true;
    mocks.tainted = true;
    const status = liveStatus();
    expect(status.reason).toBe('tainted');
    expect(status.message).toContain('刷新');
  });

  it('explains how to make it available when audio is not wired', () => {
    // This is the common case: realSpectrum is off by default, so online
    // playback is not routed through Web Audio.
    const status = liveStatus();
    expect(status.available).toBe(false);
    expect(status.reason).toBe('not_wired');
    expect(status.message).toContain('节奏频谱');
  });

  it('distinguishes "not wired" from "nothing playing"', () => {
    mocks.analyser = makeAnalyser();
    mocks.playing = false;
    const status = liveStatus();
    expect(status.reason).toBe('not_playing');
    expect(status.message).toContain('没有在播放');
  });

  it('is available once wired and playing', () => {
    mocks.analyser = makeAnalyser();
    expect(liveStatus().available).toBe(true);
  });

  it('always carries a message when unavailable, so nothing fails silently', () => {
    for (const setup of [
      () => {
        mocks.supported = false;
      },
      () => {
        mocks.tainted = true;
      },
      () => {
        mocks.analyser = null;
      },
      () => {
        mocks.analyser = makeAnalyser();
        mocks.playing = false;
      },
    ]) {
      mocks.supported = true;
      mocks.tainted = false;
      mocks.playing = true;
      mocks.analyser = null;
      setup();
      const status = liveStatus();
      expect(status.available).toBe(false);
      expect(status.message.length).toBeGreaterThan(0);
    }
  });
});

describe('readLiveWindow', () => {
  it('returns null rather than a fake reading when unavailable', () => {
    // A zeroed reading would be indistinguishable from a silent passage.
    expect(readLiveWindow()).toBeNull();
  });

  it('reads brightness, bands and loudness from the analyser', () => {
    mocks.analyser = makeAnalyser();
    const w = readLiveWindow();
    expect(w).not.toBeNull();
    expect(w!.rmsDb).toBeGreaterThan(-40);
    expect(w!.rmsDb).toBeLessThan(0);
    expect(w!.centroidHz).toBeGreaterThan(0);
    const { low, mid, high } = w!.bands;
    expect(low + mid + high).toBeGreaterThan(0.98);
    expect(low + mid + high).toBeLessThan(1.02);
    expect(w!.windowMs).toBeGreaterThan(0);
  });

  it('reports a trend once there is history to compare against', () => {
    mocks.analyser = makeAnalyser();
    const first = readLiveWindow();
    expect(first!.rmsTrendDb).toBe(0); // nothing to compare on the first read
    const second = readLiveWindow();
    expect(second).not.toBeNull();
  });
});

describe('describeLiveWindow', () => {
  it('describes only measured quantities', () => {
    mocks.analyser = makeAnalyser();
    const text = describeLiveWindow(readLiveWindow()!);
    expect(text).toContain('响度');
    expect(text).toContain('谱重心');
    expect(text).toContain('频段');
    // Must not name instruments or production choices - none were measured.
    for (const forbidden of ['吉他', '钢琴', '鼓组', '弦乐', '编曲']) {
      expect(text).not.toContain(forbidden);
    }
  });
});
