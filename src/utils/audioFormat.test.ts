import { describe, expect, it } from 'vitest';
import { detectAudioFormat, formatFromMime, formatFromUrl } from './audioFormat';

/** Builds a buffer whose first bytes are the given ASCII, padded past the sniff window. */
function bytes(...head: number[]): Uint8Array {
  const out = new Uint8Array(32);
  out.set(head, 0);
  return out;
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

describe('detectAudioFormat', () => {
  it('reads an MP3 with an ID3v2 tag', () => {
    expect(detectAudioFormat(bytes(...ascii('ID3')))).toBe('mp3');
  });

  it('reads an MP3 frame sync with no tag', () => {
    // 0xFF 0xFB: frame sync, layer bits 01 - MPEG audio, not AAC.
    expect(detectAudioFormat(bytes(0xff, 0xfb, 0x90))).toBe('mp3');
  });

  it('reads raw AAC frames as AAC rather than MP3', () => {
    // Same two leading bytes as MP3; the layer bits are what separate them.
    expect(detectAudioFormat(bytes(0xff, 0xf1, 0x50))).toBe('aac');
  });

  it('reads an MP4 container', () => {
    // ftyp sits at offset 4, after the box length.
    expect(detectAudioFormat(bytes(0, 0, 0, 0x20, ...ascii('ftypM4A ')))).toBe('m4a');
  });

  it('reads FLAC, Ogg and WAV', () => {
    expect(detectAudioFormat(bytes(...ascii('fLaC')))).toBe('flac');
    expect(detectAudioFormat(bytes(...ascii('OggS')))).toBe('ogg');
    expect(detectAudioFormat(bytes(...ascii('RIFF')))).toBe('wav');
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(detectAudioFormat(bytes(1, 2, 3, 4))).toBeNull();
  });

  it('returns null for a buffer too short to identify', () => {
    expect(detectAudioFormat(new Uint8Array(4))).toBeNull();
  });
});

describe('formatFromMime', () => {
  it('maps the common audio content types', () => {
    expect(formatFromMime('audio/mpeg')).toBe('mp3');
    expect(formatFromMime('audio/mp4')).toBe('m4a');
    expect(formatFromMime('audio/flac')).toBe('flac');
    expect(formatFromMime('audio/ogg; codecs=opus')).toBe('ogg');
  });

  it('returns null for anything it does not recognise', () => {
    expect(formatFromMime('application/octet-stream')).toBeNull();
  });
});

describe('formatFromUrl', () => {
  it('falls back to mp3 only when the URL says nothing', () => {
    expect(formatFromUrl('https://cdn.example.com/stream?id=1')).toBe('mp3');
    expect(formatFromUrl('https://cdn.example.com/a.m4a')).toBe('m4a');
    expect(formatFromUrl('https://cdn.example.com/a.FLAC')).toBe('flac');
  });
});
