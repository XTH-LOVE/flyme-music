import { describe, expect, it } from 'vitest';
import { analyzePcm } from './features';

const SR = 22050;

/**
 * A synthetic song with properties chosen in advance: 120 BPM, A minor
 * harmony, and a deliberately shaped arrangement (quiet intro -> verse -> loud
 * chorus -> quiet outro). Every assertion below is therefore checkable against
 * a known truth rather than against whatever the extractor happens to output.
 */
function buildSong(): Float32Array {
  const seconds = 20;
  const out = new Float32Array(SR * seconds);

  // A minor arpeggio with the tonic emphasised, so the key is unambiguous.
  const aMinor = [220.0, 261.63, 329.63, 440.0]; // A3 C4 E4 A4
  const fMajor = [174.61, 220.0, 261.63, 349.23]; // F3 A3 C4 F4

  const addTone = (freq: number, from: number, to: number, amp: number) => {
    const start = Math.round(from * SR);
    const end = Math.min(out.length, Math.round(to * SR));
    for (let i = start; i < end; i += 1) {
      out[i] += amp * Math.sin((2 * Math.PI * freq * (i - start)) / SR);
    }
  };

  // Harmony: A minor for 12s, then F major (a plausible move), both re-struck
  // every 2s so the chroma is stable but not perfectly static.
  for (let t = 0; t < 12; t += 2) {
    aMinor.forEach((f, i) => addTone(f, t, t + 2, i === 0 ? 0.16 : 0.09));
  }
  for (let t = 12; t < 20; t += 2) {
    fMajor.forEach((f, i) => addTone(f, t, t + 2, i === 0 ? 0.16 : 0.09));
  }

  // Drums at exactly 120 BPM from 4s onward (intro is drumless).
  const interval = (60 / 120) * SR;
  let seed = 99;
  for (let beat = 0; beat * interval < (seconds - 4) * SR; beat += 1) {
    const start = Math.round(4 * SR + beat * interval);
    for (let i = 0; i < SR * 0.02 && start + i < out.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const noise = (seed / 0x7fffffff) * 2 - 1;
      // Low-frequency thump plus a noise transient: kick-ish.
      out[start + i] += noise * 0.25 + Math.sin((2 * Math.PI * 60 * i) / SR) * 0.3;
    }
  }

  // Arrangement: quiet intro, verse, loud chorus (8-16s), quiet outro.
  const gainAt = (sec: number) => {
    if (sec < 4) return 0.25;
    if (sec < 8) return 0.5;
    if (sec < 16) return 1.0;
    return 0.3;
  };
  for (let i = 0; i < out.length; i += 1) out[i] *= gainAt(i / SR);

  return out;
}

const song = buildSong();
const features = analyzePcm(song, SR);

describe('analyzePcm on a synthetic song', () => {
  it('reports the right duration and analysis rate', () => {
    expect(features.durationSec).toBeGreaterThan(19.5);
    expect(features.durationSec).toBeLessThan(20.5);
    expect(features.analysisRate).toBeLessThanOrEqual(SR);
  });

  it('finds the 120 BPM we put in', () => {
    expect(Math.abs(features.bpm.value - 120)).toBeLessThanOrEqual(4);
    expect(features.bpm.confidence).toBeGreaterThan(0.3);
  });

  it('finds A minor', () => {
    expect(features.key.tonic).toBe(9); // A
    expect(features.key.mode).toBe('minor');
  });

  it('places the loudest moment inside the chorus', () => {
    // The chorus is 8-16s; the peak must not land in the intro or outro.
    expect(features.dynamics.peakAtSec).toBeGreaterThan(7);
    expect(features.dynamics.peakAtSec).toBeLessThan(16);
  });

  it('reports a positive dynamic range', () => {
    // The arrangement spans roughly 12 dB, so this must be comfortably > 0.
    expect(features.dynamics.rangeDb).toBeGreaterThan(3);
    expect(features.dynamics.rangeDb).toBeLessThan(40);
  });

  it('sums band energy to one', () => {
    const { low, mid, high } = features.bands;
    expect(low + mid + high).toBeGreaterThan(0.98);
    expect(low + mid + high).toBeLessThan(1.02);
  });

  it('reports a bass-heavy spectrum for a bass-heavy signal', () => {
    // Everything here lives under ~450 Hz, so low should dominate.
    expect(features.bands.low).toBeGreaterThan(features.bands.high);
  });

  it('produces a normalised energy curve with one entry per second', () => {
    expect(features.energyCurve.length).toBeGreaterThanOrEqual(19);
    expect(Math.min(...features.energyCurve)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...features.energyCurve)).toBeLessThanOrEqual(1);
    // The chorus must read louder than the intro on the curve.
    const intro = features.energyCurve.slice(1, 4);
    const chorus = features.energyCurve.slice(9, 15);
    expect(Math.max(...chorus)).toBeGreaterThan(Math.max(...intro));
  });

  it('finds at least one section boundary', () => {
    expect(features.sections.length).toBeGreaterThanOrEqual(2);
    for (const s of features.sections) {
      expect(s.endSec).toBeGreaterThan(s.startSec);
    }
  });

  it('produces a finite similarity vector', () => {
    expect(features.vector.length).toBeGreaterThan(0);
    for (const v of features.vector) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('counts onsets for a rhythmic signal', () => {
    // 16s of drums at 120 BPM is ~32 beats, so density should be a few per second.
    expect(features.onsetDensity).toBeGreaterThan(0.5);
  });
});

describe('analyzePcm robustness', () => {
  it('handles a signal shorter than one frame without throwing', () => {
    const tiny = new Float32Array(100);
    const result = analyzePcm(tiny, SR);
    expect(result.durationSec).toBeGreaterThan(0);
    expect(result.sections).toEqual([]);
    expect(result.bpm.confidence).toBe(0);
  });

  it('handles pure silence without producing NaN', () => {
    const result = analyzePcm(new Float32Array(SR * 3), SR);
    expect(Number.isFinite(result.dynamics.meanDb)).toBe(true);
    expect(Number.isFinite(result.timbre.centroidHz)).toBe(true);
    expect(result.bpm.confidence).toBeLessThan(0.2);
    for (const v of result.vector) expect(Number.isFinite(v)).toBe(true);
  });

  it('decimates 44.1 kHz input and still finds the tempo', () => {
    // Same arrangement rendered at 44.1 kHz must give the same answers.
    const seconds = 12;
    const rate = 44100;
    const out = new Float32Array(rate * seconds);
    const interval = (60 / 120) * rate;
    let seed = 5;
    for (let beat = 0; beat * interval < out.length; beat += 1) {
      const start = Math.round(beat * interval);
      for (let i = 0; i < rate * 0.02 && start + i < out.length; i += 1) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        out[start + i] = ((seed / 0x7fffffff) * 2 - 1) * 0.6;
      }
    }
    const result = analyzePcm(out, rate);
    expect(result.analysisRate).toBeLessThanOrEqual(22050);
    expect(Math.abs(result.bpm.value - 120)).toBeLessThanOrEqual(4);
  });
});
