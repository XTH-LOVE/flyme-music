import { PITCH_CLASS_NAMES } from './dsp';
import type { AudioFeatures } from './types';

/** Below this a measurement is reported as uncertain rather than asserted. */
const CONFIDENT = 0.45;

function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Describe how the loudness moves across the track.
 *
 * Derived from the measured curve, so statements like "peaks in the back half"
 * are read off the data rather than guessed. Returns null when the track barely
 * moves, in which case saying nothing is more accurate than inventing an arc.
 */
function describeDynamics(f: AudioFeatures): string | null {
  const curve = f.energyCurve;
  if (curve.length < 6) return null;
  const range = Math.max(...curve) - Math.min(...curve);
  if (range < 0.15) return '全程响度基本平稳，没有明显起伏';
  const peakIndex = curve.indexOf(Math.max(...curve));
  const position = peakIndex / curve.length;
  const where = position < 0.34 ? '前段' : position < 0.67 ? '中段' : '后段';
  const spread = range > 0.6 ? '起伏很大' : range > 0.35 ? '有明显起伏' : '起伏平缓';
  return `${spread}，最响的位置在${where}（约 ${mmss(peakIndex)}）`;
}

function describeTimbre(f: AudioFeatures): string {
  const c = f.timbre.centroidHz;
  // 2 kHz is a reasonable midpoint for mixed popular music.
  const brightness = c < 1400 ? '偏暗、偏暖' : c < 2600 ? '中性' : '偏亮';
  const texture = f.timbre.flatness > 0.15 ? '噪声感较强（打击乐/失真成分多）' : '音调感强（旋律/和声成分多）';
  return `谱重心 ${c} Hz（${brightness}），${texture}`;
}

function describeBands(f: AudioFeatures): string {
  const { low, mid, high } = f.bands;
  const parts: string[] = [];
  if (low > 0.5) parts.push('低频占主导，偏厚');
  else if (low > 0.35) parts.push('低频扎实');
  if (high > 0.35) parts.push('高频突出');
  else if (high < 0.12) parts.push('高频克制');
  if (mid > 0.5) parts.push('中频饱满');
  return parts.length ? parts.join('，') : '三频分布均衡';
}

function describeRhythm(f: AudioFeatures): string {
  const density = f.onsetDensity;
  const busy = density > 4 ? '节奏密集' : density > 2 ? '节奏适中' : '节奏疏朗';
  return `${busy}（每秒约 ${density} 个起音）`;
}

/**
 * Render the measured card as text for the model.
 *
 * Two rules govern the wording:
 *   1. Only measured quantities appear. Nothing about instrumentation,
 *      production or mood is stated, because none of that was measured.
 *   2. Low-confidence values are labelled as uncertain instead of being dropped
 *      or asserted. A wrong BPM stated confidently is worse than "unclear".
 */
export function renderFactCard(f: AudioFeatures): string {
  const lines: string[] = [];

  lines.push('【实测音频特征】以下数据由本地信号分析得出，是这首歌的客观属性。');

  const bpmLine =
    f.bpm.confidence >= CONFIDENT
      ? `速度：约 ${f.bpm.value} BPM`
      : `速度：约 ${f.bpm.value} BPM（**不确定**，该曲节拍不明显，请勿把此值当准数）`;
  lines.push(bpmLine);

  const keyName = PITCH_CLASS_NAMES[f.key.tonic];
  const keyLine =
    f.key.confidence >= CONFIDENT
      ? `调性：${keyName} ${f.key.mode === 'major' ? '大调' : '小调'}`
      : `调性：疑似 ${keyName} ${f.key.mode === 'major' ? '大调' : '小调'}（**不确定**，调性感模糊）`;
  lines.push(keyLine);

  lines.push(`时长：${mmss(f.durationSec)}`);
  lines.push(
    `动态：峰值 ${f.dynamics.peakDb} dB，平均 ${f.dynamics.meanDb} dB，` +
      `动态范围 ${f.dynamics.rangeDb} dB，峰值出现在 ${mmss(f.dynamics.peakAtSec)}`,
  );

  const dyn = describeDynamics(f);
  if (dyn) lines.push(`响度走向：${dyn}`);

  lines.push(`音色：${describeTimbre(f)}`);
  lines.push(
    `频段占比：低频 ${(f.bands.low * 100).toFixed(0)}% / 中频 ${(f.bands.mid * 100).toFixed(0)}% / 高频 ${(f.bands.high * 100).toFixed(0)}%——${describeBands(f)}`,
  );
  lines.push(`节奏：${describeRhythm(f)}`);

  if (f.sections.length > 1) {
    lines.push('结构（按频谱变化切分，只报边界与响度，不臆断段落名称）：');
    for (const s of f.sections) {
      const tags: string[] = [`${s.meanDb} dB`];
      if (s.isLoudest) tags.push('全曲最响');
      if (s.likelyChorus) tags.push('重复出现的高能量段（很可能是副歌）');
      lines.push(`  ${mmss(s.startSec)}–${mmss(s.endSec)}｜${tags.join('｜')}`);
    }
  }

  lines.push(
    '\n使用要求：' +
      '\n· 只能基于以上实测数据与歌词来谈。**不要描述你没测到的东西**（具体乐器、编制、制作手法、混音细节）。' +
      '\n· 标注为「不确定」的项，要么不提，要么明确说明你没把握。' +
      '\n· 编曲与情绪的判断要能对应到上面的数字或歌词原文（例如「副歌不是靠音量，是靠 1:12 起的动态抬升」）。' +
      '\n· 这些数字是信号分析结果，不是听感结论，允许你在有依据时给出不同解读。',
  );

  return lines.join('\n');
}

/** One-line summary for compact contexts (tool results, list rows). */
export function summarizeFactCard(f: AudioFeatures): string {
  const key = PITCH_CLASS_NAMES[f.key.tonic] + (f.key.mode === 'major' ? '大调' : '小调');
  const bpm = f.bpm.confidence >= CONFIDENT ? `${f.bpm.value} BPM` : '节拍不明显';
  const keyText = f.key.confidence >= CONFIDENT ? key : `疑似${key}`;
  return `${bpm} · ${keyText} · ${describeBands(f)}`;
}
