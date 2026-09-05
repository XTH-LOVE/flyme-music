import { isTauri } from '@/lib/apiTransport';

/**
 * Optional Web Audio layer: a real FFT for the visualizer plus a 3-band EQ.
 *
 * Cross-origin media piped through createMediaElementSource is tainted and
 * outputs silence, so the element is only wired when its source is
 * same-origin or a blob: URL (offline cache / local library). Remote streams
 * play through the plain element path and the visualizer falls back to its
 * simulated animation. Every failure latches `tainted` and never retries -
 * silence is the one unacceptable outcome.
 */

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let low: BiquadFilterNode | null = null;
let mid: BiquadFilterNode | null = null;
let high: BiquadFilterNode | null = null;
let wiredElement: HTMLAudioElement | null = null;
let tainted = false;

export interface EqPreset {
  key: string;
  label: string;
  low: number;
  mid: number;
  high: number;
}

export const EQ_PRESETS: EqPreset[] = [
  { key: 'flat', label: '原声', low: 0, mid: 0, high: 0 },
  { key: 'bass', label: '低音增强', low: 6, mid: 0, high: 0 },
  { key: 'vocal', label: '人声', low: -2, mid: 4, high: 1 },
  { key: 'treble', label: '高音', low: 0, mid: 0, high: 5 },
  { key: 'electronic', label: '电子', low: 5, mid: -1, high: 4 },
];

const EQ_STORAGE_KEY = 'aurora.eq.preset';

function isSafeForWebAudio(src: string): boolean {
  if (!src) return false;
  if (src.startsWith('blob:') || src.startsWith('data:')) return true;
  if (isTauri()) return false; // remote streams in the webview are cross-origin
  try {
    return new URL(src, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Wire the element into the graph if (and only if) it is safe to do so. */
export function ensureWired(el: HTMLAudioElement): boolean {
  if (tainted || typeof AudioContext === 'undefined') return false;
  if (wiredElement === el) {
    if (ctx?.state === 'suspended') void ctx.resume();
    return true;
  }
  if (!isSafeForWebAudio(el.currentSrc || el.src)) return false;
  try {
    ctx = ctx ?? new AudioContext();
    analyser = analyser ?? (() => {
      const node = ctx!.createAnalyser();
      node.fftSize = 128;
      node.smoothingTimeConstant = 0.8;
      return node;
    })();
    if (!low) {
      low = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 250;
    }
    if (!mid) {
      mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1800;
      mid.Q.value = 1;
    }
    if (!high) {
      high = ctx.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 5200;
      applyStoredPreset();
    }
    // Locals so TS narrowing survives across the module-level lets.
    const lowNode = low;
    const midNode = mid;
    const highNode = high;
    const analyserNode = analyser;
    const audioCtx = ctx;
    sourceNode = ctx.createMediaElementSource(el);
    sourceNode.connect(lowNode);
    lowNode.connect(midNode);
    midNode.connect(highNode);
    highNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
    wiredElement = el;
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return true;
  } catch {
    // Some engines throw when the element is already wired or the source is
    // unsupported; never risk silencing playback again after this.
    tainted = true;
    return false;
  }
}

export function isWired(): boolean {
  return analyser !== null && !tainted;
}

/** Fill `bins` from the live FFT; false when the graph is not in play. */
export function getSpectrum(bins: Uint8Array): boolean {
  if (!analyser || !wiredElement || wiredElement.paused) return false;
  analyser.getByteFrequencyData(bins);
  return true;
}

function applyGains(p: EqPreset): void {
  if (low && mid && high) {
    low.gain.value = p.low;
    mid.gain.value = p.mid;
    high.gain.value = p.high;
  }
}

function applyStoredPreset(): void {
  try {
    const key = localStorage.getItem(EQ_STORAGE_KEY);
    const preset = EQ_PRESETS.find((p) => p.key === key);
    if (preset) applyGains(preset);
  } catch {
    /* ignore */
  }
}

export function getEqPreset(): string {
  try {
    return localStorage.getItem(EQ_STORAGE_KEY) ?? 'flat';
  } catch {
    return 'flat';
  }
}

export function setEqPreset(key: string): void {
  const preset = EQ_PRESETS.find((p) => p.key === key);
  if (!preset) return;
  applyGains(preset);
  try {
    localStorage.setItem(EQ_STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
}
