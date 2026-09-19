import {
  getAnalysisAnalyser,
  hasWebAudioSupport,
  isWebAudioTainted,
  isWiredElementPlaying,
} from '@/player/webAudio';

/**
 * Live spectral reading of whatever is playing right now.
 *
 * This is the one capability that genuinely needs the audio routed through Web
 * Audio: the analyser only sees samples that pass through the graph, and a
 * cross-origin stream cannot be routed without tainting it. So this module is
 * explicitly *conditional*, and every entry point reports why it is unavailable
 * instead of returning a zero reading that would look like silence.
 */
export type LiveUnavailableReason =
  | 'unsupported'
  | 'not_wired'
  | 'tainted'
  | 'not_playing'
  | 'not_ready';

export interface LiveStatus {
  available: boolean;
  reason: LiveUnavailableReason | 'ok';
  /** User-facing explanation. Always present, so nothing fails silently. */
  message: string;
}

export interface LiveWindow {
  /** How many milliseconds of audio the reading covers. */
  windowMs: number;
  rmsDb: number;
  centroidHz: number;
  bands: { low: number; mid: number; high: number };
  /** Spectral change since the previous read: high means something just happened. */
  flux: number;
  /** Change against the reading ~3s ago, so a build or a drop is visible. */
  rmsTrendDb: number;
  centroidTrendHz: number;
}

/** fftSize 2048 at 44.1k covers ~46ms; enough to be stable, short enough to be "now". */
const FFT_SIZE = 2048;
const HISTORY_MS = 4000;

interface Sample {
  at: number;
  rmsDb: number;
  centroidHz: number;
}

let history: Sample[] = [];
let previousSpectrum: Float32Array | null = null;
let freqBuf: Float32Array | null = null;

/** Explanation for each reason, so the caller never has to invent one. */
const MESSAGES: Record<LiveUnavailableReason, string> = {
  unsupported: '当前环境不支持 Web Audio，无法实时读取音频。',
  not_wired:
    '当前音频没有接入 Web Audio（跨域直连的在线歌曲无法接入）。在设置里开启「节奏频谱」让音频经服务器转发后即可实时分析。',
  tainted: '本次会话中音频接入 Web Audio 失败过，已停用实时分析（避免再次影响播放）。刷新页面可重试。',
  not_playing: '现在没有在播放，没有可分析的音频。',
  not_ready: '音频刚接入，分析器还没拿到足够数据，稍等一下再试。',
};

export function liveStatus(): LiveStatus {
  if (!hasWebAudioSupport()) return { available: false, reason: 'unsupported', message: MESSAGES.unsupported };
  if (isWebAudioTainted()) return { available: false, reason: 'tainted', message: MESSAGES.tainted };
  if (!getAnalysisAnalyser()) return { available: false, reason: 'not_wired', message: MESSAGES.not_wired };
  if (!isWiredElementPlaying()) return { available: false, reason: 'not_playing', message: MESSAGES.not_playing };
  return { available: true, reason: 'ok', message: '' };
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/**
 * Read the current moment, or return null with the reason available separately
 * via `liveStatus()`.
 *
 * The reading is derived from the analyser's own sample rate, so the frequency
 * mapping is correct regardless of what the device is running at.
 */
export function readLiveWindow(): LiveWindow | null {
  const status = liveStatus();
  if (!status.available) return null;
  const analyser = getAnalysisAnalyser();
  if (!analyser) return null;

  const bins = analyser.frequencyBinCount;
  if (!freqBuf || freqBuf.length !== bins) {
    freqBuf = new Float32Array(bins);
    previousSpectrum = null;
  }
  analyser.getFloatFrequencyData(freqBuf);

  // getFloatFrequencyData returns dBFS; convert to linear magnitudes so band
  // ratios and the centroid are weighted by actual energy.
  const mag = new Float32Array(bins);
  for (let i = 0; i < bins; i += 1) {
    const db = freqBuf[i];
    mag[i] = Number.isFinite(db) ? Math.pow(10, db / 20) : 0;
  }

  const nyquist = (analyser.context.sampleRate || 44100) / 2;
  const binHz = nyquist / bins;

  let low = 0;
  let mid = 0;
  let high = 0;
  let weighted = 0;
  let total = 0;
  for (let i = 1; i < bins; i += 1) {
    const hz = i * binHz;
    const energy = mag[i] * mag[i];
    if (hz < 250) low += energy;
    else if (hz < 2000) mid += energy;
    else high += energy;
    weighted += mag[i] * hz;
    total += mag[i];
  }
  const bandTotal = low + mid + high || 1;

  let flux = 0;
  if (previousSpectrum && previousSpectrum.length === bins) {
    for (let i = 0; i < bins; i += 1) {
      const diff = mag[i] - previousSpectrum[i];
      if (diff > 0) flux += diff;
    }
  }
  previousSpectrum = mag;

  // Time-domain RMS is far more stable than summing the spectrum for loudness.
  const timeBuf = new Float32Array(FFT_SIZE);
  analyser.getFloatTimeDomainData(timeBuf);
  let sumSquares = 0;
  for (let i = 0; i < timeBuf.length; i += 1) sumSquares += timeBuf[i] * timeBuf[i];
  const rms = Math.sqrt(sumSquares / timeBuf.length);
  const rmsDb = 20 * Math.log10(Math.max(rms, 1e-6));
  const centroidHz = total > 0 ? weighted / total : 0;

  const now = Date.now();
  history.push({ at: now, rmsDb, centroidHz });
  history = history.filter((s) => now - s.at <= HISTORY_MS);

  // Compare against roughly three seconds back: enough to see a build or a drop,
  // short enough that it still describes "now" rather than the whole song.
  const past = history.find((s) => now - s.at >= 2500);
  const rmsTrendDb = past ? Number((rmsDb - past.rmsDb).toFixed(1)) : 0;
  const centroidTrendHz = past ? Math.round(centroidHz - past.centroidHz) : 0;

  return {
    windowMs: Math.round((FFT_SIZE / (analyser.context.sampleRate || 44100)) * 1000),
    rmsDb: Number(rmsDb.toFixed(1)),
    centroidHz: Math.round(centroidHz),
    bands: {
      low: Number((low / bandTotal).toFixed(3)),
      mid: Number((mid / bandTotal).toFixed(3)),
      high: Number((high / bandTotal).toFixed(3)),
    },
    flux: Number(mean([flux]).toFixed(4)),
    rmsTrendDb,
    centroidTrendHz,
  };
}

/** Reset the rolling history - call when playback jumps or the track changes. */
export function resetLiveHistory(): void {
  history = [];
  previousSpectrum = null;
}

/** Describe the live reading in words, from the measurements only. */
export function describeLiveWindow(w: LiveWindow): string {
  const parts: string[] = [];
  parts.push(`响度 ${w.rmsDb} dB`);
  const brightness = w.centroidHz < 1400 ? '偏暗' : w.centroidHz < 2600 ? '中性' : '偏亮';
  parts.push(`谱重心 ${w.centroidHz} Hz（${brightness}）`);
  parts.push(
    `频段 低${(w.bands.low * 100).toFixed(0)}%/中${(w.bands.mid * 100).toFixed(0)}%/高${(w.bands.high * 100).toFixed(0)}%`,
  );

  if (Math.abs(w.rmsTrendDb) >= 3) {
    parts.push(`相比约 3 秒前响度${w.rmsTrendDb > 0 ? '抬升' : '下降'}了 ${Math.abs(w.rmsTrendDb)} dB`);
  } else {
    parts.push('相比约 3 秒前响度基本持平');
  }
  if (Math.abs(w.centroidTrendHz) >= 300) {
    parts.push(`音色${w.centroidTrendHz > 0 ? '变亮' : '变暗'}了约 ${Math.abs(w.centroidTrendHz)} Hz`);
  }
  if (w.flux > 0.5) parts.push('频谱变化剧烈（刚有强起音或段落切换）');
  else if (w.flux > 0.15) parts.push('有持续的能量起伏');

  return parts.join('，');
}
