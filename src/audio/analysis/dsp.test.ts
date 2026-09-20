import { describe, expect, it } from 'vitest';
import {
  chromaFromMagnitudes,
  estimateKey,
  estimateTempo,
  fft,
  hannWindow,
  hzToPitchClass,
  magnitudeSpectrum,
  spectralCentroid,
  spectralFlatness,
  spectralFlux,
} from './dsp';

/**
 * The whole point of keeping the DSP as pure functions is being able to feed it
 * signals whose answer is known in advance. "Produces plausible numbers" is not
 * the same as "measures correctly", and only synthetic input can tell them apart.
 */

const SR = 22050;

function sine(freq: number, seconds: number, sampleRate = SR, amp = 0.8): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i += 1) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

/** Short noise bursts at a fixed interval - a stand-in for a click track. */
function clicks(bpm: number, seconds: number, sampleRate = SR): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const interval = (60 / bpm) * sampleRate;
  const burst = Math.round(0.01 * sampleRate);
  let seed = 12345;
  for (let beat = 0; beat * interval + burst < out.length; beat += 1) {
    const start = Math.round(beat * interval);
    for (let i = 0; i < burst; i += 1) {
      // Deterministic pseudo-noise so the test cannot flake.
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      out[start + i] = ((seed / 0x7fffffff) * 2 - 1) * 0.9;
    }
  }
  return out;
}

/** Spectral flux per frame, the onset envelope tempo estimation runs on. */
function onsetEnvelope(signal: Float32Array, fftSize = 1024, hop = 256): Float32Array {
  const window = hannWindow(fftSize);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const mag = new Float32Array(fftSize >> 1);
  const prev = new Float32Array(fftSize >> 1);
  const frame = new Float32Array(fftSize);
  const frames = Math.max(0, Math.floor((signal.length - fftSize) / hop));
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    frame.set(signal.subarray(f * hop, f * hop + fftSize));
    magnitudeSpectrum(frame, window, re, im, mag);
    out[f] = f === 0 ? 0 : spectralFlux(mag, prev);
    prev.set(mag);
  }
  return out;
}

describe('fft', () => {
  it('rejects non power-of-two sizes', () => {
    expect(() => fft(new Float32Array(3), new Float32Array(3))).toThrow(/power of two/);
  });

  it('puts a pure tone in the expected bin', () => {
    const fftSize = 1024;
    const binHz = SR / fftSize;
    const targetBin = 64; // ~1378 Hz
    const freq = targetBin * binHz;
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i += 1) re[i] = Math.sin((2 * Math.PI * freq * i) / SR);
    fft(re, im);
    let peak = 0;
    let peakBin = 0;
    for (let i = 1; i < fftSize >> 1; i += 1) {
      const mag = Math.hypot(re[i], im[i]);
      if (mag > peak) {
        peak = mag;
        peakBin = i;
      }
    }
    expect(peakBin).toBe(targetBin);
  });
});

describe('pitch class mapping', () => {
  it('maps A4 to A and C4 to C', () => {
    expect(hzToPitchClass(440)).toBe(9); // A
    expect(hzToPitchClass(261.63)).toBe(0); // C
    expect(hzToPitchClass(880)).toBe(9); // A5
  });
});

describe('tempo estimation', () => {
  // Tempo estimation is the feature most likely to be silently wrong, so it is
  // checked across a spread of real-world tempos rather than one value.
  for (const bpm of [80, 100, 120, 140]) {
    it(`detects ${bpm} BPM within 3`, () => {
      const envelope = onsetEnvelope(clicks(bpm, 12));
      const result = estimateTempo(envelope, SR / 256);
      expect(Math.abs(result.bpm - bpm)).toBeLessThanOrEqual(3);
    });
  }

  it('reports no confidence for a featureless signal', () => {
    const flat = new Float32Array(200); // no onsets at all
    const result = estimateTempo(flat, SR / 256);
    expect(result.confidence).toBe(0);
  });

  it('does not report a tempo for steady silence', () => {
    const result = estimateTempo(onsetEnvelope(new Float32Array(SR * 5), 1024, 256), SR / 256);
    expect(result.confidence).toBeLessThan(0.2);
  });
});

describe('key estimation', () => {
  /** Chroma built from the given scale degrees, weighted by degree importance. */
  function chromaOf(tonic: number, mode: 'major' | 'minor'): Float32Array {
    const major = [0, 2, 4, 5, 7, 9, 11];
    const minor = [0, 2, 3, 5, 7, 8, 10];
    const degrees = mode === 'major' ? major : minor;
    const chroma = new Float32Array(12);
    degrees.forEach((d, i) => {
      // Tonic and fifth are the strongest, as in real tonal music.
      const weight = i === 0 ? 1 : i === 4 ? 0.8 : 0.6;
      chroma[(tonic + d) % 12] = weight;
    });
    return chroma;
  }

  it('identifies C major', () => {
    const result = estimateKey(chromaOf(0, 'major'));
    expect(result.tonic).toBe(0);
    expect(result.mode).toBe('major');
  });

  it('identifies A minor', () => {
    const result = estimateKey(chromaOf(9, 'minor'));
    expect(result.tonic).toBe(9);
    expect(result.mode).toBe('minor');
  });

  it('identifies F# major, a non-trivial tonic', () => {
    const result = estimateKey(chromaOf(6, 'major'));
    expect(result.tonic).toBe(6);
    expect(result.mode).toBe('major');
  });

  it('reports low confidence for an ambiguous flat chroma', () => {
    const flat = new Float32Array(12).fill(1);
    expect(estimateKey(flat).confidence).toBeLessThan(0.5);
  });
});

describe('chroma from a real spectrum', () => {
  it('puts a 440 Hz tone on the A pitch class', () => {
    const fftSize = 4096;
    const window = hannWindow(fftSize);
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    const mag = new Float32Array(fftSize >> 1);
    const signal = sine(440, fftSize / SR + 0.01);
    const frame = new Float32Array(fftSize);
    frame.set(signal.subarray(0, fftSize));
    magnitudeSpectrum(frame, window, re, im, mag);
    const chroma = new Float32Array(12);
    chromaFromMagnitudes(mag, SR, fftSize, chroma);
    let peak = 0;
    let peakPc = 0;
    for (let i = 0; i < 12; i += 1) {
      if (chroma[i] > peak) {
        peak = chroma[i];
        peakPc = i;
      }
    }
    expect(peakPc).toBe(9); // A
  });
});

describe('spectral descriptors', () => {
  it('reports a brighter centroid for a higher tone', () => {
    const fftSize = 2048;
    const window = hannWindow(fftSize);
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    const mag = new Float32Array(fftSize >> 1);

    const low = new Float32Array(fftSize);
    low.set(sine(220, fftSize / SR + 0.01).subarray(0, fftSize));
    magnitudeSpectrum(low, window, re, im, mag);
    const lowCentroid = spectralCentroid(mag, SR, fftSize);

    const high = new Float32Array(fftSize);
    high.set(sine(3000, fftSize / SR + 0.01).subarray(0, fftSize));
    magnitudeSpectrum(high, window, re, im, mag);
    const highCentroid = spectralCentroid(mag, SR, fftSize);

    expect(highCentroid).toBeGreaterThan(lowCentroid);
  });

  it('separates noise from a tone by flatness', () => {
    const fftSize = 2048;
    const window = hannWindow(fftSize);
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    const mag = new Float32Array(fftSize >> 1);
    const frame = new Float32Array(fftSize);

    frame.set(sine(440, fftSize / SR + 0.01).subarray(0, fftSize));
    magnitudeSpectrum(frame, window, re, im, mag);
    const toneFlatness = spectralFlatness(mag);

    let seed = 7;
    for (let i = 0; i < fftSize; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      frame[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    magnitudeSpectrum(frame, window, re, im, mag);
    const noiseFlatness = spectralFlatness(mag);

    expect(noiseFlatness).toBeGreaterThan(toneFlatness);
  });
});
