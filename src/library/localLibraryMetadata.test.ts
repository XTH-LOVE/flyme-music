import { describe, expect, it } from 'vitest';
import { parseFileName } from './localLibrary';

describe('local library metadata', () => {
  it('keeps a filename parser usable for editable metadata', () => {
    expect(parseFileName('Artist - Title.mp3')).toEqual({ artist: 'Artist', title: 'Title' });
  });
});

