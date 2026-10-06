import { describe, expect, it } from 'vitest';
import { optimizeLyricLines } from './lyricOptimize';

describe('optimizeLyricLines', () => {
  it('normalises whitespace and sorts rows', () => {
    const result = optimizeLyricLines([
      { time: 2, text: '  later   line  ' },
      { time: 1, text: 'first' },
    ]);
    expect(result.map((line) => line.text)).toEqual(['first', 'later line']);
  });

  it('clamps tiny word overlaps to the next line', () => {
    const result = optimizeLyricLines([
      {
        time: 0,
        text: 'one',
        words: [{ text: 'one', start: 0, end: 1.2 }],
      },
      { time: 1, text: 'two' },
    ]);
    expect(result[0].words?.[0].end).toBe(1);
  });
});
