import { describe, expect, it } from 'vitest';
import { collectIndexLetters, indexBarLetters, indexKeyOf, indexKeyOfChar } from './indexLetters';

describe('indexKeyOfChar', () => {
  it('uppercases Latin letters', () => {
    expect(indexKeyOfChar('a')).toBe('A');
    expect(indexKeyOfChar('Z')).toBe('Z');
  });

  it('resolves Han characters through pinyin collation', () => {
    expect(indexKeyOfChar('周')).toBe('Z');
    expect(indexKeyOfChar('爱')).toBe('A');
    expect(indexKeyOfChar('海')).toBe('H');
    expect(indexKeyOfChar('雪')).toBe('X');
  });

  it('buckets a Han character with its own pinyin, not the previous letter', () => {
    // Regression guard for the boundary table: with 塌 as the T boundary, 他
    // (same "tā", fewer strokes) collated before it and landed in S.
    expect(indexKeyOfChar('他')).toBe('T');
    expect(indexKeyOfChar('柒')).toBe('Q');
    expect(indexKeyOfChar('夕')).toBe('X');
  });

  it('buckets non-Latin, non-Han scripts under #', () => {
    expect(indexKeyOfChar('5')).toBe('#');
    expect(indexKeyOfChar('あ')).toBe('#');
    expect(indexKeyOfChar('Д')).toBe('#');
  });
});

describe('indexKeyOf', () => {
  it('skips leading punctuation and whitespace', () => {
    expect(indexKeyOf('  《晴天》')).toBe('Q');
    expect(indexKeyOf('...Yesterday')).toBe('Y');
    expect(indexKeyOf('(A)')).toBe('A');
  });

  it('falls back to # when there is nothing indexable', () => {
    expect(indexKeyOf('')).toBe('#');
    expect(indexKeyOf('   ')).toBe('#');
    expect(indexKeyOf('!!!')).toBe('#');
  });
});

describe('collectIndexLetters', () => {
  it('lists only the letters present, A-Z then #', () => {
    const letters = collectIndexLetters(['Apple', 'Banana', '周杰伦', '42']);
    expect(letters).toEqual(['A', 'B', 'Z', '#']);
  });

  it('omits letters with no entries', () => {
    expect(collectIndexLetters(['Apple'])).toEqual(['A']);
  });

  it('is empty for an empty library', () => {
    expect(collectIndexLetters([])).toEqual([]);
  });
});

describe('indexBarLetters', () => {
  it('pads a sparse library out to the full alphabet', () => {
    // Three letters would look like a broken bar; a full A-Z reads as a
    // position indicator with the empty letters dimmed.
    const letters = indexBarLetters(['Apple', 'Banana']);
    expect(letters).toHaveLength(27);
    expect(letters[0]).toBe('A');
    expect(letters[25]).toBe('Z');
    expect(letters[26]).toBe('#');
  });

  it('uses the sparse list once enough letters are present', () => {
    const letters = indexBarLetters(['Apple', 'Banana', 'Cat', 'Dog', '周杰伦']);
    expect(letters).toEqual(['A', 'B', 'C', 'D', 'Z']);
  });
});
