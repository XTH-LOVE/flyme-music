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

/* ---------- Automatic level matching (AGC) ---------- */

/**
 * Target RMS, roughly -17 dBFS. Sources differ a lot in loudness - a GD
 * aggregator stream, a scraped Hi歌 stream and a local file are all mastered
 * differently - so switching tracks currently means reaching for the volume.
 *
 * This is a closed loop: the analyser sits AFTER the gain node, so the measured
 * level already includes the correction. Dividing the target by what we measure
 * and nudging the gain toward that is self-correcting, and the smoothing keeps
 * it from pumping.
 */
const LEVEL_TARGET_RMS = 0.14;
const LEVEL_MIN_GAIN = 0.3;
const LEVEL_MAX_GAIN = 3.5;
const LEVEL_TICK_MS = 250;
/** Fraction of the remaining error applied per tick. */
const LEVEL_SMOOTHING = 0.25;
const LEVEL_STORAGE_KEY = 'aurora.levelMatching';

let levelGain: GainNode | null = null;
let levelAnalyser: AnalyserNode | null = null;
let levelTimer: number | null = null;
let levelEnabled = false;
let levelBuf: Float32Array | null = null;

const clampGain = (value: number): number =>
  Math.max(LEVEL_MIN_GAIN, Math.min(LEVEL_MAX_GAIN, value));

function tickLevel(): void {
  if (!levelGain || !levelAnalyser || !wiredElement || wiredElement.paused) return;
  if (!levelBuf || levelBuf.length !== levelAnalyser.fftSize) {
    levelBuf = new Float32Array(levelAnalyser.fftSize);
  }
  levelAnalyser.getFloatTimeDomainData(levelBuf);
  let sum = 0;
  for (let i = 0; i < levelBuf.length; i += 1) sum += levelBuf[i] * levelBuf[i];
  const rms = Math.sqrt(sum / levelBuf.length);
  // Near-silence carries no usable level information; adjusting on it would
  // crank the gain up during the quiet intro of every track.
  if (rms < 1e-4) return;

  const current = levelGain.gain.value;
  const desired = clampGain(current * (LEVEL_TARGET_RMS / rms));
  levelGain.gain.value = current + (desired - current) * LEVEL_SMOOTHING;
}

function syncLevelTimer(): void {
  const shouldRun = levelEnabled && levelGain !== null && !tainted;
  if (shouldRun && levelTimer === null) {
    levelTimer = window.setInterval(tickLevel, LEVEL_TICK_MS);
  } else if (!shouldRun && levelTimer !== null) {
    window.clearInterval(levelTimer);
    levelTimer = null;
    // Hand control back to the user's volume slider untouched.
    if (levelGain) levelGain.gain.value = 1;
  }
}

export function isLevelMatching(): boolean {
  return levelEnabled;
}

/** Turn automatic level matching on/off. Persisted like the EQ preset. */
export function setLevelMatching(on: boolean): void {
  levelEnabled = on;
  try {
    localStorage.setItem(LEVEL_STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  syncLevelTimer();
}

function applyStoredLevelSetting(): void {
  try {
    levelEnabled = localStorage.getItem(LEVEL_STORAGE_KEY) === '1';
  } catch {
    levelEnabled = false;
  }
}

// Read once at module load; setLevelMatching owns the flag from then on.
applyStoredLevelSetting();

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
    levelGain = levelGain ?? ctx.createGain();
    levelAnalyser =
      levelAnalyser ??
      (() => {
        const node = ctx!.createAnalyser();
        // Far longer window than the visualiser's 128 samples: RMS over ~3ms
        // swings too much to drive a level correction sensibly.
        node.fftSize = 2048;
        return node;
      })();
    sourceNode.connect(lowNode);
    lowNode.connect(midNode);
    midNode.connect(highNode);
    highNode.connect(levelGain);
    levelGain.connect(levelAnalyser);
    levelAnalyser.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
    wiredElement = el;
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    syncLevelTimer();
    return true;
  } catch {
    // Some engines throw when the element is already wired or the source is
    // unsupported; never risk silencing playback again after this.
    tainted = true;
    return false;
  }
}

/**
 * The high-resolution analyser, or null when the audio is not routed through
 * Web Audio.
 *
 * Callers must treat null as "cannot measure right now" and say so, rather than
 * reporting a zero reading that looks like silence. See the live-analysis
 * status helper for the user-facing reason.
 */
export function getAnalysisAnalyser(): AnalyserNode | null {
  return tainted ? null : levelAnalyser;
}

/** True once wiring failed permanently for this session (cross-origin, etc). */
export function isWebAudioTainted(): boolean {
  return tainted;
}

/** Whether the platform offers Web Audio at all. */
export function hasWebAudioSupport(): boolean {
  return typeof AudioContext !== 'undefined';
}

/** True when the currently wired element is actually producing sound. */
export function isWiredElementPlaying(): boolean {
  return Boolean(wiredElement && !wiredElement.paused);
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
