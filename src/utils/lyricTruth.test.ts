import { describe, expect, it } from 'vitest';
import { diagnoseLyrics, sanitizeLyricWords } from './lyricTruth';
import type { TimedLyricLine } from './timedLyrics';

const exact: TimedLyricLine = {
  time: 0,
  text: 'Hello world',
  words: [
    { text: 'Hello ', start: 0, end: 0.5 },
    { text: 'world', start: 0.5, end: 1 },
  ],
};

describe('lyric truth diagnostics', () => {
  it('recognises valid word timing', () => {
    expect(diagnoseLyrics([exact], 2).quality).toBe('word-exact');
  });

  it('rejects mismatched word text but keeps the line', () => {
    const bad = { ...exact, words: [{ text: 'Bye', start: 0, end: 1 }] };
    expect(diagnoseLyrics([bad], 2).rejectedWordTiming['text-mismatch']).toBe(1);
    expect(sanitizeLyricWords([bad], 2)[0].words).toBeUndefined();
  });

  it('marks lyrics after the track boundary invalid', () => {
    expect(diagnoseLyrics([{ time: 3, text: 'late' }], 2).quality).toBe('unavailable');
    expect(diagnoseLyrics([{ time: 3, text: 'late' }], 2).invalidLineCount).toBe(1);
  });
});

