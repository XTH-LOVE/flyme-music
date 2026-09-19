import {
  chromaFromMagnitudes,
  estimateKey,
  estimateTempo,
  hannWindow,
  magnitudeSpectrum,
  rms,
  spectralCentroid,
  spectralFlatness,
  spectralFlux,
  spectralRolloff,
  toDb,
  zeroCrossingRate,
} from './dsp';
import { FEATURES_VERSION, type AudioFeatures } from './types';

/** Analysis frame. 2048 @ 22050 Hz gives ~10 Hz bins - enough for chroma. */
const FFT_SIZE = 2048;
const HOP = 512;
/** Tempo needs a finer hop than chroma; the onset envelope uses its own pass. */
const ONSET_HOP = 256;
const ONSET_FFT = 1024;

/** Analysis is done at this rate; higher input is decimated first. */
const TARGET_RATE = 22050;

const LOW_HZ = 250;
const MID_HZ = 2000;

/**
 * Averaging decimator. Real music has little energy above 11 kHz that matters
 * for these features, so folding a 44.1 kHz track down to 22.05 kHz roughly
 * halves the work without changing the answers. Averaging (rather than picking
 * every other sample) is a crude but adequate anti-alias filter here.
 */
function decimate(input: Float32Array, sampleRate: number): { samples: Float32Array; rate: number } {
  if (sampleRate <= TARGET_RATE) return { samples: input, rate: sampleRate };
  const factor = Math.max(2, Math.round(sampleRate / TARGET_RATE));
  const out = new Float32Array(Math.floor(input.length / factor));
  for (let i = 0; i < out.length; i += 1) {
    let sum = 0;
    const base = i * factor;
    for (let k = 0; k < factor; k += 1) sum += input[base + k];
    out[i] = sum / factor;
  }
  return { samples: out, rate: sampleRate / factor };
}

/** Spectral flux per frame - the onset envelope tempo estimation runs on. */
function onsetEnvelope(signal: Float32Array, rate: number): Float32Array {
  const window = hannWindow(ONSET_FFT);
  const re = new Float32Array(ONSET_FFT);
  const im = new Float32Array(ONSET_FFT);
  const mag = new Float32Array(ONSET_FFT >> 1);
  const prev = new Float32Array(ONSET_FFT >> 1);
  const frame = new Float32Array(ONSET_FFT);
  const frames = Math.max(0, Math.floor((signal.length - ONSET_FFT) / ONSET_HOP));
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    frame.set(signal.subarray(f * ONSET_HOP, f * ONSET_HOP + ONSET_FFT));
    magnitudeSpectrum(frame, window, re, im, mag);
    out[f] = f === 0 ? 0 : spectralFlux(mag, prev);
    prev.set(mag);
  }
  void rate;
  return out;
}

interface FrameStats {
  chroma: Float32Array;
  db: number;
  centroid: number;
  rolloff: number;
  flatness: number;
  zcr: number;
  low: number;
  mid: number;
  high: number;
  timeSec: number;
}

/** Single pass over the signal collecting everything except tempo. */
function collectFrames(signal: Float32Array, rate: number): FrameStats[] {
  const window = hannWindow(FFT_SIZE);
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const mag = new Float32Array(FFT_SIZE >> 1);
  const frame = new Float32Array(FFT_SIZE);
  const frames = Math.max(0, Math.floor((signal.length - FFT_SIZE) / HOP));
  const binHz = rate / FFT_SIZE;
  const stats: FrameStats[] = [];

  for (let f = 0; f < frames; f += 1) {
    const start = f * HOP;
    frame.set(signal.subarray(start, start + FFT_SIZE));
    magnitudeSpectrum(frame, window, re, im, mag);

    const chroma = new Float32Array(12);
    chromaFromMagnitudes(mag, rate, FFT_SIZE, chroma);

    let low = 0;
    let mid = 0;
    let high = 0;
    for (let i = 1; i < mag.length; i += 1) {
      const hz = i * binHz;
      const energy = mag[i] * mag[i];
      if (hz < LOW_HZ) low += energy;
      else if (hz < MID_HZ) mid += energy;
      else high += energy;
    }

    stats.push({
      chroma,
      db: toDb(rms(frame)),
      centroid: spectralCentroid(mag, rate, FFT_SIZE),
      rolloff: spectralRolloff(mag, rate, FFT_SIZE),
      flatness: spectralFlatness(mag),
      zcr: zeroCrossingRate(frame),
      low,
      mid,
      high,
      timeSec: start / rate,
    });
  }
  return stats;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))];
}

/** Average chroma across the track, used for key estimation. */
function aggregateChroma(stats: FrameStats[]): Float32Array {
  const out = new Float32Array(12);
  for (const s of stats) {
    for (let i = 0; i < 12; i += 1) out[i] += s.chroma[i];
  }
  let norm = 0;
  for (let i = 0; i < 12; i += 1) norm += out[i] * out[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < 12; i += 1) out[i] /= norm;
  }
  return out;
}

/**
 * Section boundaries from spectral novelty.
 *
 * Compares each ~2s block's chroma+timbre to the block before it; large change
 * means something happened. Peaks above a threshold become boundaries. No
 * attempt is made to name sections beyond the `likelyChorus` flag, because
 * naming is interpretation and this layer only reports measurements.
 */
function findSections(
  stats: FrameStats[],
  durationSec: number,
): AudioFeatures['sections'] {
  if (stats.length < 8) return [];
  const blockSec = 2;
  const perBlock = Math.max(1, Math.round((blockSec * (stats[0] ? 1 : 1)) / (HOP / TARGET_RATE)));
  const blocks: Array<{ chroma: Float32Array; db: number; startSec: number }> = [];

  for (let i = 0; i + perBlock <= stats.length; i += perBlock) {
    const slice = stats.slice(i, i + perBlock);
    const chroma = new Float32Array(12);
    for (const s of slice) {
      for (let k = 0; k < 12; k += 1) chroma[k] += s.chroma[k];
    }
    let norm = 0;
    for (let k = 0; k < 12; k += 1) norm += chroma[k] * chroma[k];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let k = 0; k < 12; k += 1) chroma[k] /= norm;
    blocks.push({ chroma, db: mean(slice.map((s) => s.db)), startSec: slice[0].timeSec });
  }
  if (blocks.length < 3) return [];

  // Novelty: 1 - cosine similarity between neighbouring blocks.
  const novelty: number[] = [0];
  for (let i = 1; i < blocks.length; i += 1) {
    let dot = 0;
    for (let k = 0; k < 12; k += 1) dot += blocks[i].chroma[k] * blocks[i - 1].chroma[k];
    novelty.push(Math.max(0, 1 - dot));
  }

  const threshold = Math.max(0.08, percentile(novelty, 0.8));
  const boundaries: number[] = [0];
  for (let i = 1; i < blocks.length - 1; i += 1) {
    if (novelty[i] >= threshold && novelty[i] >= novelty[i - 1] && novelty[i] >= novelty[i + 1]) {
      boundaries.push(i);
    }
  }
  if (boundaries[boundaries.length - 1] !== blocks.length - 1) boundaries.push(blocks.length - 1);

  const raw = boundaries.map((blockIndex, idx) => {
    const nextIndex = boundaries[idx + 1] ?? blocks.length;
    const slice = blocks.slice(blockIndex, nextIndex);
    return {
      startSec: blocks[blockIndex].startSec,
      endSec: idx === boundaries.length - 1 ? durationSec : (blocks[nextIndex]?.startSec ?? durationSec),
      meanDb: mean(slice.map((b) => b.db)),
      chroma: slice[0]?.chroma ?? new Float32Array(12),
    };
  });

  const loudestDb = Math.max(...raw.map((s) => s.meanDb));
  // A chorus is loud *and* returns: the same high-energy material appearing more
  // than once. Both conditions are checked so a single loud bridge is not called
  // a chorus.
  const loud = raw.filter((s) => s.meanDb >= loudestDb - 1.5);
  const chorusLike = new Set<number>();
  for (let i = 0; i < loud.length; i += 1) {
    for (let j = i + 1; j < loud.length; j += 1) {
      let dot = 0;
      for (let k = 0; k < 12; k += 1) dot += loud[i].chroma[k] * loud[j].chroma[k];
      if (dot > 0.85) {
        chorusLike.add(raw.indexOf(loud[i]));
        chorusLike.add(raw.indexOf(loud[j]));
      }
    }
  }

  return raw.map((s, i) => ({
    startSec: Number(s.startSec.toFixed(2)),
    endSec: Number(s.endSec.toFixed(2)),
    meanDb: Number(s.meanDb.toFixed(1)),
    isLoudest: s.meanDb >= loudestDb - 0.01,
    likelyChorus: chorusLike.has(i),
  }));
}

/**
 * Full analysis of decoded PCM.
 *
 * Pure and synchronous so it can run in a Worker (or in tests) with no DOM.
 * Every derived value keeps a confidence; nothing is asserted beyond what the
 * signal supports.
 */
export function analyzePcm(input: Float32Array, sampleRate: number): AudioFeatures {
  const { samples, rate } = decimate(input, sampleRate);
  const durationSec = samples.length / rate;

  const stats = collectFrames(samples, rate);
  const envelope = onsetEnvelope(samples, rate);
  const tempo = estimateTempo(envelope, rate / ONSET_HOP);
  const chroma = aggregateChroma(stats);
  const key = estimateKey(chroma);

  const dbs = stats.map((s) => s.db);
  const peakDb = dbs.length ? Math.max(...dbs) : -60;
  const peakIndex = dbs.indexOf(peakDb);
  const meanDb = mean(dbs);

  // Per-second loudness, normalised so the shape is readable regardless of level.
  const perSecond: number[] = [];
  for (const s of stats) {
    const bucket = Math.floor(s.timeSec);
    perSecond[bucket] = Math.max(perSecond[bucket] ?? -Infinity, s.db);
  }
  const curve = perSecond.map((v) => (Number.isFinite(v) ? v : peakDb));
  const curveMin = Math.min(...curve, 0);
  const curveMax = Math.max(...curve, curveMin + 1);
  const energyCurve = curve.map((v) => Number(((v - curveMin) / (curveMax - curveMin)).toFixed(3)));

  const totalLow = stats.reduce((a, s) => a + s.low, 0);
  const totalMid = stats.reduce((a, s) => a + s.mid, 0);
  const totalHigh = stats.reduce((a, s) => a + s.high, 0);
  const bandTotal = totalLow + totalMid + totalHigh || 1;

  // Onsets: flux peaks well above the local average.
  const fluxMean = mean([...envelope]);
  const fluxSd = Math.sqrt(mean([...envelope].map((v) => (v - fluxMean) ** 2)));
  const onsetThreshold = fluxMean + fluxSd * 1.5;
  let onsets = 0;
  for (let i = 1; i < envelope.length; i += 1) {
    if (envelope[i] > onsetThreshold && envelope[i] > envelope[i - 1]) onsets += 1;
  }

  const bands = {
    low: Number((totalLow / bandTotal).toFixed(3)),
    mid: Number((totalMid / bandTotal).toFixed(3)),
    high: Number((totalHigh / bandTotal).toFixed(3)),
  };

  const timbre = {
    centroidHz: Math.round(mean(stats.map((s) => s.centroid))),
    rolloffHz: Math.round(mean(stats.map((s) => s.rolloff))),
    flatness: Number(mean(stats.map((s) => s.flatness)).toFixed(4)),
    zeroCrossingRate: Number(mean(stats.map((s) => s.zcr)).toFixed(4)),
  };

  const onsetDensity = durationSec > 0 ? Number((onsets / durationSec).toFixed(2)) : 0;
  const dynamics = {
    peakDb: Number(peakDb.toFixed(1)),
    meanDb: Number(meanDb.toFixed(1)),
    rangeDb: Number((peakDb - meanDb).toFixed(1)),
    peakAtSec: Number((stats[peakIndex]?.timeSec ?? 0).toFixed(1)),
  };

  const sections = findSections(stats, durationSec);

  return {
    version: FEATURES_VERSION,
    // Three decimals: two rounded a very short clip down to "0.00 seconds",
    // which is not a duration any caller should ever see.
    durationSec: Number(durationSec.toFixed(3)),
    analysisRate: rate,
    bpm: { value: Math.round(tempo.bpm * 10) / 10, confidence: Number(tempo.confidence.toFixed(2)) },
    key: { tonic: key.tonic, mode: key.mode, confidence: Number(key.confidence.toFixed(2)) },
    dynamics,
    timbre,
    bands,
    energyCurve,
    onsetDensity,
    sections,
    vector: buildVector({ bpm: tempo.bpm, bands, timbre, onsetDensity, dynamics }),
  };
}

/**
 * Compact embedding for similarity.
 *
 * Hand-built rather than learned, so its meaning is inspectable: tempo, how the
 * energy sits across the spectrum, brightness, percussiveness and how much the
 * track moves dynamically. Weighted so no single axis dominates the distance.
 */
function buildVector(input: {
  bpm: number;
  bands: { low: number; mid: number; high: number };
  timbre: { centroidHz: number; flatness: number; zeroCrossingRate: number };
  onsetDensity: number;
  dynamics: { rangeDb: number };
}): number[] {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  return [
    clamp01(input.bpm / 200) * 1.4,
    clamp01(input.bands.low) * 1.2,
    clamp01(input.bands.mid) * 1.0,
    clamp01(input.bands.high) * 1.2,
    clamp01(input.timbre.centroidHz / 8000) * 1.5,
    clamp01(input.timbre.flatness / 0.5) * 0.8,
    clamp01(input.timbre.zeroCrossingRate / 0.3) * 0.8,
    clamp01(input.onsetDensity / 6) * 1.3,
    clamp01(input.dynamics.rangeDb / 30) * 1.0,
  ].map((v) => Number(v.toFixed(4)));
}
