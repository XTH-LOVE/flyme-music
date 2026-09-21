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
/**
 * How far the loop may amplify, and why it is not 3.5 any more.
 *
 * At 3.5 - about 11dB - a quiet passage was lifted enough that the loud one
 * after it clipped, and the result was the crackle of an over-driven signal
 * rather than a levelled one. Combined with the slow release below, the gain
 * stayed up long after the quiet part ended, which is exactly when the damage
 * happens.
 *
 * 1.8 is about 5dB: enough to even out the difference between two masters, not
 * enough to drive a normal one into its ceiling.
 */
const LEVEL_MAX_GAIN = 1.8;
const LEVEL_TICK_MS = 250;

/**
 * Attack and release, and why they are not the same number.
 *
 * The first version applied a symmetric 25% of the remaining error every
 * 250ms, which is a time constant of about 0.75s. That is fast enough to
 * follow the music rather than the recording: the gain dropped on every chorus
 * and came back up on every verse, and the result was a track that got quieter
 * and louder throughout - exactly what level matching is supposed to prevent.
 *
 * A real AGC is asymmetric. Reducing gain may be urgent (a loud passage is
 * about to clip) so it moves quickly; raising it is never urgent, and doing it
 * quickly means amplifying a quiet passage just in time for the loud one after
 * it. The release is therefore an order of magnitude slower.
 */
const LEVEL_ATTACK = 0.35;
const LEVEL_RELEASE = 0.03;

/**
 * Ignore corrections smaller than this.
 *
 * Without a deadband the loop chases its own noise floor forever, nudging the
 * gain every tick by an amount nobody can hear but which keeps the compressor
 * audibly busy.
 */
const LEVEL_DEADBAND_DB = 1.5;

/**
 * Ticks averaged before a correction is considered - about two seconds.
 *
 * The measurement window has to be longer than a phrase. Over 250ms the loop
 * sees syllables; over two seconds it sees how loud the passage actually is.
 */
const LEVEL_WINDOW_TICKS = 8;
const LEVEL_STORAGE_KEY = 'aurora.levelMatching';

let levelGain: GainNode | null = null;
let limiter: DynamicsCompressorNode | null = null;
let levelAnalyser: AnalyserNode | null = null;
let levelTimer: number | null = null;
let levelEnabled = false;
let levelBuf: Float32Array | null = null;
let levelRmsSum = 0;
let levelRmsTicks = 0;

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

  // Average across the window before acting on it - see LEVEL_WINDOW_TICKS.
  levelRmsSum += rms;
  levelRmsTicks += 1;
  if (levelRmsTicks < LEVEL_WINDOW_TICKS) return;
  const average = levelRmsSum / levelRmsTicks;
  levelRmsSum = 0;
  levelRmsTicks = 0;

  const current = levelGain.gain.value;
  const desired = clampGain(current * (LEVEL_TARGET_RMS / average));

  const changeDb = 20 * Math.log10(desired / current);
  if (Math.abs(changeDb) < LEVEL_DEADBAND_DB) return;

  // Loud is urgent, quiet is not.
  const rate = desired < current ? LEVEL_ATTACK : LEVEL_RELEASE;
  levelGain.gain.value = current + (desired - current) * rate;
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
    // A stale window would apply the last track's loudness to the next one.
    levelRmsSum = 0;
    levelRmsTicks = 0;
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
const EQ_CUSTOM_KEY = 'aurora.eq.custom';

/**
 * A user-set curve, stored separately from the preset key.
 *
 * Kept apart rather than as another entry in EQ_PRESETS because it is not one:
 * a preset is a named starting point that ships with the app, and this is what
 * the user arrived at by moving the sliders. Folding it into the list would
 * mean either a preset that changes under them or a growing list of unnamed
 * ones.
 */
export interface EqGains {
  low: number;
  mid: number;
  high: number;
}

/** The band limits the sliders offer, in dB. */
export const EQ_RANGE_DB = 12;

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
    // Order matters, and the obvious one is wrong.
    //
    // Level matching runs first, on the raw source, and the EQ runs after it.
    // With the EQ first the two fight: the loop measures its own output, so
    // raising a band raises the measured level, and the loop lowers the gain to
    // compensate - the band is boosted and the whole track is turned down, and
    // the slider sounds like it did nothing.
    //
    // It is also the more honest arrangement. Level matching exists because
    // different sources are mastered at different loudness, which is a property
    // of the source; the EQ curve is a property of the listener. Measuring the
    // source for the first and applying the second afterwards is what each is
    // actually for.
    sourceNode.connect(levelGain);
    levelGain.connect(levelAnalyser);
    levelAnalyser.connect(lowNode);
    lowNode.connect(midNode);
    midNode.connect(highNode);

    /*
     * A ceiling, and the reason it is not optional.
     *
     * Level matching raises the gain on quiet material and the EQ raises whole
     * bands on top of that. Neither knows what the peak is about to be, so
     * without something here the sum can exceed full scale and the output
     * crackles - which is the sound of a signal being cut off flat, and reads
     * as a broken file rather than a loud one.
     *
     * A compressor used as a limiter: threshold just below zero, ratio at the
     * maximum the API allows, and a knee of zero so it is a ceiling rather than
     * a gradual squeeze. It does nothing at all until something would clip.
     */
    limiter = limiter ?? ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    highNode.connect(limiter);

    // The visualiser sits last on purpose: it should show what is coming out,
    // not what went in.
    limiter.connect(analyserNode);
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
/**
 * Whether anything in the Web Audio chain is actually doing work.
 *
 * The player routes audio through a same-origin proxy to unlock Web Audio, and
 * it used to do that only when the spectrum visualiser was on. The EQ and level
 * matching depend on the same wiring but had no say in it, so with the
 * visualiser off every preset and slider was silently inert - the controls
 * moved, the audio did not change, and nothing said why.
 *
 * Anything that needs the graph has to be able to ask for it.
 */
export function needsSameOriginAudio(): boolean {
  if (isLevelMatching()) return true;
  const gains = getEqGains();
  return gains.low !== 0 || gains.mid !== 0 || gains.high !== 0;
}

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

function applyGains(p: EqGains): void {
  if (low && mid && high) {
    low.gain.value = p.low;
    mid.gain.value = p.mid;
    high.gain.value = p.high;
  }
}

function applyStoredPreset(): void {
  try {
    const key = localStorage.getItem(EQ_STORAGE_KEY);
    if (key === 'custom') {
      applyGains(getEqGains());
      return;
    }
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

/** The curve currently in effect, whether it came from a preset or the user. */
export function getEqGains(): EqGains {
  try {
    if (localStorage.getItem(EQ_STORAGE_KEY) === 'custom') {
      const raw = localStorage.getItem(EQ_CUSTOM_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<EqGains>;
        return {
          low: clampDb(Number(parsed.low) || 0),
          mid: clampDb(Number(parsed.mid) || 0),
          high: clampDb(Number(parsed.high) || 0),
        };
      }
    }
  } catch {
    /* fall through to the preset */
  }
  const preset = EQ_PRESETS.find((p) => p.key === getEqPreset());
  return preset ? { low: preset.low, mid: preset.mid, high: preset.high } : { low: 0, mid: 0, high: 0 };
}

export function isEqCustom(): boolean {
  try {
    return localStorage.getItem(EQ_STORAGE_KEY) === 'custom';
  } catch {
    return false;
  }
}

/**
 * Applies a hand-made curve and remembers it.
 *
 * Applied immediately rather than on release: the whole point of a slider is
 * hearing what it does, and committing only at the end makes the control feel
 * like it is deciding for you.
 */
export function setEqGains(gains: EqGains): void {
  const next: EqGains = {
    low: clampDb(gains.low),
    mid: clampDb(gains.mid),
    high: clampDb(gains.high),
  };
  applyGains(next);
  try {
    localStorage.setItem(EQ_STORAGE_KEY, 'custom');
    localStorage.setItem(EQ_CUSTOM_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function clampDb(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-EQ_RANGE_DB, Math.min(EQ_RANGE_DB, Math.round(value * 10) / 10));
}
