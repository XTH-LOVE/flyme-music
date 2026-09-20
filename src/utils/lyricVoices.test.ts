import { describe, expect, it } from 'vitest';
import {
  analyseLyricVoices,
  parseLyricLine,
  parseVoiceTag,
  plainLyricLines,
  plainLyricText,
  splitBackgroundRuns,
  voiceSide,
} from './lyricVoices';

describe('parseVoiceTag', () => {
  it('reads the common Chinese tags', () => {
    expect(parseVoiceTag('男：夜空中最亮的星').voice).toBe('male');
    expect(parseVoiceTag('女：我祈祷拥有一颗透明的心灵').voice).toBe('female');
    expect(parseVoiceTag('合：请指引我靠近你').voice).toBe('both');
  });

  it('accepts a half-width colon and a space after it', () => {
    expect(parseVoiceTag('男: 夜空中最亮的星')).toEqual({
      voice: 'male',
      text: '夜空中最亮的星',
    });
  });

  it('accepts bracketed and lettered tags', () => {
    expect(parseVoiceTag('【女】我祈祷').voice).toBe('female');
    expect(parseVoiceTag('[A] 第一句').voice).toBe('a');
    expect(parseVoiceTag('B：第二句').voice).toBe('b');
  });

  it('accepts the long forms', () => {
    expect(parseVoiceTag('男声：独唱').voice).toBe('male');
    expect(parseVoiceTag('合唱：所有人').voice).toBe('both');
    expect(parseVoiceTag('MALE: hello').voice).toBe('male');
  });

  it('leaves an untagged line completely alone', () => {
    expect(parseVoiceTag('夜空中最亮的星')).toEqual({
      voice: null,
      text: '夜空中最亮的星',
    });
  });

  it('does not mistake a credit line for a voice tag', () => {
    // Netease sheets open with these, and they carry the same colon.
    for (const credit of ['作词 : 张三', '作曲：李四', '编曲 : 王五']) {
      expect(parseVoiceTag(credit).voice).toBeNull();
      expect(parseVoiceTag(credit).text).toBe(credit);
    }
  });

  it('does not treat a word merely starting with a voice word as a tag', () => {
    // "合" is a voice tag; "合唱团" is not followed by a colon, so it is text.
    expect(parseVoiceTag('合唱团在台上').voice).toBeNull();
    expect(parseVoiceTag('男女老少都来了').voice).toBeNull();
  });

  it('only reads a tag at the very start of the line', () => {
    expect(parseVoiceTag('他说 女：我不信').voice).toBeNull();
  });
});

describe('voiceSide', () => {
  it('puts male and the first unnamed voice on the left', () => {
    expect(voiceSide('male')).toBe('left');
    expect(voiceSide('a')).toBe('left');
  });

  it('puts female and the second unnamed voice on the right', () => {
    expect(voiceSide('female')).toBe('right');
    expect(voiceSide('b')).toBe('right');
  });

  it('centres a unison line and an untagged one', () => {
    expect(voiceSide('both')).toBe('center');
    expect(voiceSide(null)).toBe('center');
  });
});

describe('splitBackgroundRuns', () => {
  it('leaves a plain line as a single foreground run', () => {
    expect(splitBackgroundRuns('夜空中最亮的星')).toEqual([
      { text: '夜空中最亮的星', background: false },
    ]);
  });

  it('marks a trailing aside as background', () => {
    expect(splitBackgroundRuns('我爱你（和声）')).toEqual([
      { text: '我爱你', background: false },
      { text: '和声', background: true },
    ]);
  });

  it('handles an aside in the middle without losing the spacing', () => {
    expect(splitBackgroundRuns('我 (oh) 爱你')).toEqual([
      { text: '我 ', background: false },
      { text: 'oh', background: true },
      { text: ' 爱你', background: false },
    ]);
  });

  it('handles a leading aside', () => {
    expect(splitBackgroundRuns('（前奏）开始了')).toEqual([
      { text: '前奏', background: true },
      { text: '开始了', background: false },
    ]);
  });

  it('handles several asides', () => {
    const runs = splitBackgroundRuns('a（1）b（2）c');
    expect(runs.map((r) => r.background)).toEqual([false, true, false, true, false]);
  });

  it('reads full-width, half-width and lenticular brackets alike', () => {
    for (const text of ['（和声）', '(和声)', '【和声】']) {
      expect(splitBackgroundRuns('x' + text)).toEqual([
        { text: 'x', background: false },
        { text: '和声', background: true },
      ]);
    }
  });

  it('treats an unclosed bracket as ordinary text rather than swallowing the line', () => {
    expect(splitBackgroundRuns('我爱你（和声')).toEqual([
      { text: '我爱你（和声', background: false },
    ]);
  });

  it('does not nest: the inner pair wins and the rest stays foreground', () => {
    const runs = splitBackgroundRuns('a（b（c）d）e');
    expect(runs.map((r) => r.text)).toEqual(['a（b', 'c', 'd）e']);
    expect(runs.map((r) => r.background)).toEqual([false, true, false]);
  });
});

describe('parseLyricLine', () => {
  it('strips the voice tag from the foreground text', () => {
    const line = parseLyricLine('女：我祈祷拥有一颗透明的心灵');
    expect(line.voice).toBe('female');
    expect(line.text).toBe('我祈祷拥有一颗透明的心灵');
  });

  it('keeps asides out of the foreground text but keeps them for rendering', () => {
    const line = parseLyricLine('合：我们（一起）走吧');
    expect(line.text).toBe('我们走吧');
    expect(line.runs.map((r) => r.text)).toEqual(['我们', '一起', '走吧']);
    expect(line.allBackground).toBe(false);
  });

  it('flags a line that is nothing but an aside', () => {
    const line = parseLyricLine('（和声）');
    expect(line.text).toBe('');
    expect(line.allBackground).toBe(true);
  });

  it('does not flag an empty line as background', () => {
    expect(parseLyricLine('').allBackground).toBe(false);
    expect(parseLyricLine('   ').allBackground).toBe(false);
  });

  it('trims the line but preserves the spacing inside it', () => {
    const line = parseLyricLine('  我 爱 你  ');
    expect(line.text).toBe('我 爱 你');
    expect(line.runs[0].text).toBe('我 爱 你');
  });

  it('handles a line with neither convention', () => {
    const line = parseLyricLine('夜空中最亮的星');
    expect(line).toEqual({
      voice: null,
      text: '夜空中最亮的星',
      runs: [{ text: '夜空中最亮的星', background: false }],
      allBackground: false,
    });
  });
});

describe('analyseLyricVoices', () => {
  it('calls a male/female alternation a duet', () => {
    const analysis = analyseLyricVoices(['男：第一句', '女：第二句', '合：第三句']);
    expect(analysis.duet).toBe(true);
    expect(analysis.voices).toEqual(['male', 'female', 'both']);
  });

  it('calls an A/B alternation a duet', () => {
    expect(analyseLyricVoices(['A：一', 'B：二']).duet).toBe(true);
  });

  it('is not fooled by a chorus-only sheet', () => {
    // Every tagged line is 合： - that is a unison annotation, not a duet, and
    // splitting it into two columns would look broken.
    const analysis = analyseLyricVoices(['合：一', '合：二', '合：三']);
    expect(analysis.duet).toBe(false);
    expect(analysis.voices).toEqual(['both']);
  });

  it('is not fooled by a sheet that only ever names one side', () => {
    expect(analyseLyricVoices(['男：一', '男：二', '合：三']).duet).toBe(false);
  });

  it('is not a duet when there are no tags at all', () => {
    const analysis = analyseLyricVoices(['一', '二', '三']);
    expect(analysis.duet).toBe(false);
    expect(analysis.voices).toEqual([]);
    expect(analysis.lines).toHaveLength(3);
  });

  it('records voices in first-appearance order', () => {
    expect(analyseLyricVoices(['女：一', '男：二']).voices).toEqual(['female', 'male']);
  });

  it('lines up one-to-one with the input', () => {
    const texts = ['男：一', '二', '（和声）'];
    const analysis = analyseLyricVoices(texts);
    expect(analysis.lines).toHaveLength(texts.length);
    expect(analysis.lines[2].allBackground).toBe(true);
  });
});

describe('plainLyricText', () => {
  it('drops both the voice tag and the asides', () => {
    expect(plainLyricText('女：我（哦）祈祷')).toBe('我祈祷');
  });

  it('is empty for a pure aside, so callers can fall back', () => {
    expect(plainLyricText('（和声）')).toBe('');
  });

  it('passes an ordinary line through untouched', () => {
    expect(plainLyricText('夜空中最亮的星')).toBe('夜空中最亮的星');
  });
});

describe('plainLyricLines', () => {
  it('strips every line and keeps the timing', () => {
    const lines = plainLyricLines([
      { time: 1, text: '男：第一句' },
      { time: 2, text: '女：第二句（哦）' },
    ]);
    expect(lines.map((l) => l.text)).toEqual(['第一句', '第二句']);
    expect(lines.map((l) => l.time)).toEqual([1, 2]);
  });

  it('carries translations through', () => {
    const lines = plainLyricLines([{ time: 1, text: '女：你好', trans: 'hello' }]);
    expect(lines[0].trans).toBe('hello');
  });

  it('lets a pure aside borrow the line before it', () => {
    const lines = plainLyricLines([
      { time: 1, text: '男：第一句' },
      { time: 2, text: '（和声）' },
      { time: 3, text: '女：第三句' },
    ]);
    expect(lines.map((l) => l.text)).toEqual(['第一句', '第一句', '第三句']);
  });

  it('leaves an opening aside empty rather than inventing text', () => {
    const lines = plainLyricLines([{ time: 1, text: '（前奏）' }]);
    expect(lines[0].text).toBe('');
  });
});
