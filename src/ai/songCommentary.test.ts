import { describe, expect, it } from 'vitest';
import { buildCommentaryMessages, commentarySourceNote } from './songCommentary';
import type { AudioFeatures } from '@/audio/analysis';

const SONG = { name: '晴天', artist: ['周杰伦'], album: '叶惠美', source: 'netease' };

function features(overrides: Partial<AudioFeatures> = {}): AudioFeatures {
  return {
    version: 2,
    durationSec: 269,
    analysisRate: 11025,
    bpm: { value: 92, confidence: 0.9 },
    key: { tonic: 9, mode: 'minor', confidence: 0.8 },
    dynamics: { peakDb: -3.2, meanDb: -14.1, rangeDb: 10.9, peakAtSec: 150 },
    timbre: { centroidHz: 2100, rolloffHz: 4800, flatness: 0.08, zeroCrossingRate: 0.05 },
    bands: { low: 0.38, mid: 0.44, high: 0.18 },
    energyCurve: [0.2, 0.25, 0.3, 0.5, 0.8, 0.95, 0.6, 0.4],
    onsetDensity: 3.1,
    sections: [
      { startSec: 0, endSec: 16, meanDb: -18, isLoudest: false, likelyChorus: false },
      { startSec: 58, endSec: 84, meanDb: -9, isLoudest: true, likelyChorus: true },
    ],
    vector: [1, 2, 3],
    ...overrides,
  };
}

function systemOf(card: AudioFeatures | null): string {
  const messages = buildCommentaryMessages({ persona: 'PERSONA.', song: SONG, lyric: '歌词一行', card });
  return messages[0].content;
}

function userOf(card: AudioFeatures | null, lyric: string | null = '歌词一行'): string {
  const messages = buildCommentaryMessages({ persona: 'PERSONA.', song: SONG, lyric, card });
  return messages[1].content;
}

describe('buildCommentaryMessages', () => {
  it('hands the model the measured card when the track was analysed', () => {
    const user = userOf(features());
    expect(user).toContain('【实测音频特征】');
    expect(user).toContain('92 BPM');
    expect(user).toContain('0:58'); // section boundary, rendered as mm:ss
  });

  it('licenses sound talk only when measurements exist', () => {
    expect(systemOf(features())).toContain('实测音频数据');
    expect(systemOf(null)).toContain('没有拿到音频实测数据');
  });

  it('never invites arrangement guesses from lyrics alone', () => {
    // The old prompt asked for "能从歌词推断的听感/编曲线索" - the exact
    // fabrication this rewrite exists to stop. Guard against its return.
    const system = systemOf(null);
    expect(system).not.toContain('从歌词推断');
    expect(system).toContain('不要推断编曲');
    expect(userOf(null)).not.toContain('【实测音频特征】');
  });

  it('states plainly when there are no lyrics and no measurements', () => {
    const user = userOf(null, null);
    expect(user).toContain('暂无可用歌词');
    expect(user).toContain('歌曲：《晴天》');
  });

  it('keeps the persona ahead of the rules', () => {
    expect(systemOf(null).startsWith('PERSONA.')).toBe(true);
    expect(systemOf(features()).startsWith('PERSONA.')).toBe(true);
  });

  it('labels which basis the commentary had', () => {
    expect(commentarySourceNote(features())).toContain('实测音频特征');
    expect(commentarySourceNote(null)).toContain('仅基于歌词');
  });
});
