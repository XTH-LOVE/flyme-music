/**
 * Minimal DSP primitives for local audio analysis.
 *
 * Everything here is a pure function over typed arrays - no browser APIs - so
 * the whole analysis path can be exercised in tests against synthetic signals
 * with known answers (a click track at a known tempo, a pure tone at a known
 * pitch). That is the only way to know the extractor is right rather than
 * merely producing plausible-looking numbers.
 */

/**
 * In-place iterative radix-2 Cooley-Tukey FFT. `re`/`im` must be power-of-two
 * length. Returns nothing; the caller reads `re`/`im` afterwards.
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error('fft: length must be a power of two');

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Hann window, precomputed for a given size. */
export function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i += 1) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  return w;
}

/**
 * Magnitude spectrum of one windowed frame. `out` has length fftSize/2.
 * Accepts the window as an argument so callers can reuse one.
 */
export function magnitudeSpectrum(
  frame: Float32Array,
  window: Float32Array,
  re: Float32Array,
  im: Float32Array,
  out: Float32Array,
): void {
  const n = re.length;
  for (let i = 0; i < n; i += 1) {
    re[i] = (frame[i] ?? 0) * window[i];
    im[i] = 0;
  }
  fft(re, im);
  const half = n >> 1;
  for (let i = 0; i < half; i += 1) out[i] = Math.hypot(re[i], im[i]);
}

/** Root-mean-square of a slice, used for the loudness envelope. */
export function rms(frame: Float32Array, from = 0, to = frame.length): number {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += frame[i] * frame[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

export function toDb(amplitude: number): number {
  return 20 * Math.log10(Math.max(amplitude, 1e-6));
}

/**
 * Spectral flux: sum of positive magnitude increases against the previous frame.
 * Rising energy across many bins is what a percussive onset looks like, so this
 * is the signal both the tempo estimate and the onset count are built on.
 */
export function spectralFlux(current: Float32Array, previous: Float32Array): number {
  let flux = 0;
  for (let i = 0; i < current.length; i += 1) {
    const diff = current[i] - previous[i];
    if (diff > 0) flux += diff;
  }
  return flux;
}

/** Spectral centroid in Hz - the "brightness" of a frame. */
export function spectralCentroid(magnitudes: Float32Array, sampleRate: number, fftSize: number): number {
  let weighted = 0;
  let total = 0;
  for (let i = 1; i < magnitudes.length; i += 1) {
    weighted += magnitudes[i] * ((i * sampleRate) / fftSize);
    total += magnitudes[i];
  }
  return total > 0 ? weighted / total : 0;
}

/** Frequency below which `fraction` of the spectral energy sits. */
export function spectralRolloff(
  magnitudes: Float32Array,
  sampleRate: number,
  fftSize: number,
  fraction = 0.85,
): number {
  let total = 0;
  for (let i = 0; i < magnitudes.length; i += 1) total += magnitudes[i];
  if (total <= 0) return 0;
  const target = total * fraction;
  let running = 0;
  for (let i = 0; i < magnitudes.length; i += 1) {
    running += magnitudes[i];
    if (running >= target) return (i * sampleRate) / fftSize;
  }
  return (magnitudes.length * sampleRate) / fftSize;
}

/**
 * Spectral flatness (geometric mean / arithmetic mean). Near 1 for noise-like
 * material, near 0 for tonal - a cheap proxy for "how percussive/noisy".
 */
export function spectralFlatness(magnitudes: Float32Array): number {
  let logSum = 0;
  let sum = 0;
  let count = 0;
  for (let i = 1; i < magnitudes.length; i += 1) {
    const value = magnitudes[i] + 1e-10;
    logSum += Math.log(value);
    sum += value;
    count += 1;
  }
  if (!count || sum <= 0) return 0;
  return Math.exp(logSum / count) / (sum / count);
}

export function zeroCrossingRate(frame: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < frame.length; i += 1) {
    if ((frame[i - 1] >= 0) !== (frame[i] >= 0)) crossings += 1;
  }
  return crossings / frame.length;
}

/** A4 = 440 Hz. */
export const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function hzToPitchClass(hz: number): number {
  const midi = 69 + 12 * Math.log2(hz / 440);
  return ((Math.round(midi) % 12) + 12) % 12;
}

/**
 * Fold magnitudes onto the 12 pitch classes.
 *
 * Only bins whose frequency is a real musical pitch are used (roughly 55 Hz to
 * 2 kHz, where fundamentals and strong harmonics live); above that the harmonic
 * series blurs into everything and would only add noise to the chroma.
 */
export function chromaFromMagnitudes(
  magnitudes: Float32Array,
  sampleRate: number,
  fftSize: number,
  out: Float32Array,
): void {
  out.fill(0);
  const binHz = sampleRate / fftSize;
  const minHz = 55;
  const maxHz = 2000;
  for (let i = 1; i < magnitudes.length; i += 1) {
    const hz = i * binHz;
    if (hz < minHz || hz > maxHz) continue;
    out[hzToPitchClass(hz)] += magnitudes[i];
  }
  let norm = 0;
  for (let i = 0; i < 12; i += 1) norm += out[i] * out[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < 12; i += 1) out[i] /= norm;
  }
}

/**
 * Krumhansl-Kessler key profiles. Correlating a track's chroma against these is
 * the standard cheap key estimator; it is far from perfect on real music, which
 * is exactly why the caller keeps the confidence and can decline to state a key.
 */
export const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(a: Float32Array | number[], b: number[]): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i += 1) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : 0;
}

/** Rotate a profile so index 0 sits on the candidate tonic. */
function rotate(profile: number[], tonic: number): number[] {
  const out = new Array<number>(12);
  for (let i = 0; i < 12; i += 1) out[i] = profile[(i - tonic + 12) % 12];
  return out;
}

/**
 * Best-matching major/minor key for a chroma vector.
 *
 * `confidence` is the gap between the best and runner-up correlation, scaled to
 * 0..1. A small gap means the estimate is a coin flip and should be reported as
 * uncertain rather than asserted.
 */
export function estimateKey(chroma: Float32Array): {
  tonic: number;
  mode: 'major' | 'minor';
  confidence: number;
} {
  const scored: Array<{ tonic: number; mode: 'major' | 'minor'; score: number }> = [];
  for (let tonic = 0; tonic < 12; tonic += 1) {
    scored.push({ tonic, mode: 'major', score: correlate(chroma, rotate(KK_MAJOR, tonic)) });
    scored.push({ tonic, mode: 'minor', score: correlate(chroma, rotate(KK_MINOR, tonic)) });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const runnerUp = scored[1];
  // Correlations here land roughly in 0.3-0.9; a 0.1 gap is a solid win.
  const gap = Math.max(0, best.score - runnerUp.score);
  return {
    tonic: best.tonic,
    mode: best.mode,
    confidence: Math.max(0, Math.min(1, gap / 0.1)),
  };
}

/**
 * Autocorrelation-based tempo estimate.
 *
 * The onset envelope is autocorrelated and the strongest peak inside a musical
 * lag range wins. Octave errors are the classic failure (60 vs 120 vs 240), so
 * the search range is biased toward 70-160 BPM and the confidence reflects how
 * far the winning peak stands above the rest.
 */
export function estimateTempo(
  onsetEnvelope: Float32Array,
  envelopeRate: number,
): { bpm: number; confidence: number } {
  const n = onsetEnvelope.length;
  if (n < 8) return { bpm: 0, confidence: 0 };

  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += onsetEnvelope[i];
  mean /= n;
  const centered = new Float32Array(n);
  for (let i = 0; i < n; i += 1) centered[i] = onsetEnvelope[i] - mean;

  const minBpm = 60;
  const maxBpm = 200;
  const minLag = Math.max(1, Math.floor((60 / maxBpm) * envelopeRate));
  const maxLag = Math.min(n - 1, Math.ceil((60 / minBpm) * envelopeRate));
  if (maxLag <= minLag) return { bpm: 0, confidence: 0 };

  let bestLag = 0;
  let bestScore = -Infinity;
  const scores: Array<{ lag: number; score: number }> = [];
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = 0; i + lag < n; i += 1) sum += centered[i] * centered[i + lag];
    // Normalise by overlap so long lags are not penalised for having fewer terms.
    const score = sum / (n - lag);
    scores.push({ lag, score });
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (!bestLag) return { bpm: 0, confidence: 0 };

  let bpm = (60 * envelopeRate) / bestLag;
  // Prefer the 70-160 window: fold implausibly slow/fast readings into it.
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;

  // Confidence: how far the winner stands above the median of the field.
  const sorted = scores.map((s) => s.score).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const spread = Math.max(1e-9, Math.abs(median));
  const ratio = (bestScore - median) / spread;
  return { bpm, confidence: Math.max(0, Math.min(1, ratio / 3)) };
}
