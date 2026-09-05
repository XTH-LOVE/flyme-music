import { describe, expect, it } from 'vitest';
import { parseFileName } from './localLibrary';

describe('parseFileName', () => {
  it('splits "Artist - Title" and keeps further dashes in the title', () => {
    expect(parseFileName('周杰伦 - 晴天.mp3')).toEqual({ artist: '周杰伦', title: '晴天' });
    expect(parseFileName('Aimer - BRILLIANT - Star.flac')).toEqual({ artist: 'Aimer', title: 'BRILLIANT - Star' });
  });

  it('falls back to the bare file name without an artist part', () => {
    expect(parseFileName('track01.mp3')).toEqual({ artist: '本地音乐', title: 'track01' });
  });
});
