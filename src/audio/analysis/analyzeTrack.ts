import type { MusicTrack } from '@/music/source/types';
import { resolveTrackUrl } from '@/music/source/track-resolver';
import { readCachedCard, writeCachedCard } from './cache';
import { analyzePcm } from './features';
import type { AnalysisRequest, AnalysisResponse } from './analysis.worker';
import { FEATURES_VERSION, trackKeyOf, type FeatureCard } from './types';

/** Above this the worker is worth it; below it, inline is faster than the spawn. */
const WORKER_THRESHOLD_SAMPLES = 22050 * 5;

/**
 * Fetch the whole track as bytes.
 *
 * Direct first, then through our own proxy: the proxy is same-origin, which is
 * also what keeps the buffer untainted for decodeAudioData. Cross-origin media
 * piped through Web Audio is tainted and cannot be decoded, so the proxy is not
 * merely a fallback here - it is the path that makes analysis possible at all.
 */
async function fetchAudioBytes(streamUrl: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  try {
    const direct = await fetch(streamUrl, { mode: 'cors', signal });
    if (direct.ok) return await direct.arrayBuffer();
  } catch {
    /* fall through to the proxy */
  }
  const res = await fetch('/api/media-proxy?url=' + encodeURIComponent(streamUrl), { signal });
  if (!res.ok) throw new Error('音频下载失败：' + res.status);
  return await res.arrayBuffer();
}

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Decode compressed audio to PCM using the platform decoder. */
async function decode(bytes: ArrayBuffer): Promise<{ samples: Float32Array; sampleRate: number }> {
  const Ctor = audioContextCtor();
  if (!Ctor) throw new Error('当前环境不支持音频解码');
  const ctx = new Ctor();
  try {
    const buffer = await ctx.decodeAudioData(bytes.slice(0));
    // Mix to mono: the features are spectral and loudness-based, and a single
    // channel halves the work without changing any of the answers.
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const mono = new Float32Array(length);
    for (let c = 0; c < channels; c += 1) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i += 1) mono[i] += data[i];
    }
    if (channels > 1) {
      for (let i = 0; i < length; i += 1) mono[i] /= channels;
    }
    return { samples: mono, sampleRate: buffer.sampleRate };
  } finally {
    void ctx.close();
  }
}

/** Run the analysis in a worker when the clip is big enough to matter. */
async function runAnalysis(samples: Float32Array, sampleRate: number): Promise<Awaited<ReturnType<typeof analyzePcm>>> {
  if (typeof Worker === 'undefined' || samples.length < WORKER_THRESHOLD_SAMPLES) {
    return analyzePcm(samples, sampleRate);
  }
  try {
    const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    const features = await new Promise<ReturnType<typeof analyzePcm>>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
        if (event.data.ok && event.data.features) resolve(event.data.features);
        else reject(new Error(event.data.error ?? '分析失败'));
      };
      worker.onerror = () => reject(new Error('分析 worker 出错'));
      const request: AnalysisRequest = { samples, sampleRate };
      worker.postMessage(request, [samples.buffer]);
    });
    worker.terminate();
    return features;
  } catch {
    // Some webviews refuse module workers. Analysis is a side path, so degrade
    // to inline rather than failing the request.
    return analyzePcm(samples, sampleRate);
  }
}

export interface AnalyzeOptions {
  /** Skip the cache and re-analyse (after an extractor change, for example). */
  force?: boolean;
  signal?: AbortSignal;
  onStage?: (stage: 'resolving' | 'downloading' | 'decoding' | 'analyzing') => void;
}

/**
 * Full pipeline: resolve stream -> download -> decode -> analyse -> cache.
 *
 * Returns null when the track cannot be analysed (no stream, unsupported codec,
 * aborted). Callers must treat that as "no facts available" and say so, rather
 * than falling back to guessing - the entire point of this module is to remove
 * invented descriptions.
 */
export async function analyzeTrack(track: MusicTrack, options: AnalyzeOptions = {}): Promise<FeatureCard | null> {
  const key = trackKeyOf(track);
  if (!options.force) {
    const cached = await readCachedCard(key);
    if (cached) return cached;
  }

  // Every failure below returns null rather than throwing, because the contract
  // is "null means no facts available" and callers branch on it. Resolving can
  // fail, the download can 502, and the platform can refuse to decode - none of
  // those should reach the caller as an exception.
  try {
    options.onStage?.('resolving');
    const streamUrl = await resolveTrackUrl(track, 128);
    if (!streamUrl) return null;
    if (options.signal?.aborted) return null;

    options.onStage?.('downloading');
    const bytes = await fetchAudioBytes(streamUrl, options.signal);
    if (options.signal?.aborted) return null;

    options.onStage?.('decoding');
    const { samples, sampleRate } = await decode(bytes);
    if (options.signal?.aborted) return null;

    options.onStage?.('analyzing');
    const features = await runAnalysis(samples, sampleRate);

    const card: FeatureCard = {
      ...features,
      trackKey: key,
      track,
      name: track.name,
      artist: track.artist.join(' / '),
      analyzedAt: Date.now(),
    };
    await writeCachedCard(key, card);
    return card;
  } catch {
    return null;
  }
}

export { FEATURES_VERSION };
