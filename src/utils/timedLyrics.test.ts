// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseTimedLrc, parseTimedLyricFile } from './timedLyrics';

describe('timed lyric parsing', () => {
  it('parses ordinary LRC timestamps and expands repeated timestamps', () => {
    expect(parseTimedLrc('[00:01.2][00:03.40]Hello')).toEqual([
      { time: 1.2, text: 'Hello', words: undefined },
      { time: 3.4, text: 'Hello', words: undefined },
    ]);
  });

  it('keeps enhanced LRC word timing and strips timestamp markup', () => {
    const [line] = parseTimedLrc('[00:02.00]<00:02.00>Hello <00:02.50>world');
    expect(line.time).toBe(2);
    expect(line.text).toBe('Hello world');
    expect(line.words).toEqual([
      { text: 'Hello ', start: 2, end: 2.5 },
      { text: 'world', start: 2.5, end: 4.3 },
    ]);
  });

  it('parses TTML paragraph and word spans', () => {
    const lines = parseTimedLyricFile(
      '<tt><body><div><p begin="2s"><span begin="2s" end="2.4s">Hello </span><span begin="2.4s" end="3s">world</span></p></div></body></tt>',
    );
    expect(lines).toEqual([
      {
        time: 2,
        text: 'Hello world',
        words: [
          { text: 'Hello ', start: 2, end: 2.4 },
          { text: 'world', start: 2.4, end: 3 },
        ],
      },
    ]);
  });

  it('returns no lines for blank or unrecognized LRC content', () => {
    expect(parseTimedLyricFile('  ')).toEqual([]);
    expect(parseTimedLrc('not a timed lyric')).toEqual([]);
  });

  it('rejects malformed XML instead of silently importing it', () => {
    expect(() => parseTimedLyricFile('<tt><p>unfinished')).toThrow('TTML 文件格式无效');
  });
});
