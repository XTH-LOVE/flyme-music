/**
 * Works out what an audio stream actually is, from its bytes.
 *
 * The extension used to come from the URL string: `.m4a` or `.flac` if those
 * appeared in it, `mp3` otherwise. Music APIs hand out stream URLs with no
 * extension at all, so every one of those was saved as `.mp3` regardless of
 * what it contained - a file that says MP3 on the outside and is AAC on the
 * inside, which most players refuse to open.
 *
 * The bytes are the only thing that knows. A URL is a hint; this is evidence.
 */

export type AudioFormat = 'mp3' | 'm4a' | 'flac' | 'ogg' | 'wav' | 'aac';

/** Enough for every signature below; `ftyp` sits at offset 4. */
export const SNIFF_BYTES = 16;

function startsWith(bytes: Uint8Array, offset: number, ascii: string): boolean {
  for (let i = 0; i < ascii.length; i += 1) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Identifies a format from the leading bytes, or null when nothing matches.
 *
 * Signatures, in the order they are checked:
 *  - `ID3`      an MP3 with an ID3v2 tag, which is most of them
 *  - `0xFFEx`   an MP3 frame sync with no tag
 *  - `ftyp`     an ISO base media file - m4a, or AAC in an MP4 container
 *  - `fLaC`     FLAC
 *  - `OggS`     Ogg, which for this app means Opus or Vorbis
 *  - `RIFF`     WAV
 *  - `ADTS`     raw AAC frames, 0xFFF1 / 0xFFF9
 */
export function detectAudioFormat(bytes: Uint8Array): AudioFormat | null {
  if (bytes.length < 12) return null;

  if (startsWith(bytes, 0, 'ID3')) return 'mp3';
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    // A frame sync with no ID3 tag. The layer bits distinguish MP3 from raw
    // AAC, which shares the same two leading bytes.
    const layer = (bytes[1] >> 1) & 0x03;
    return layer === 0 ? 'aac' : 'mp3';
  }
  if (startsWith(bytes, 4, 'ftyp')) return 'm4a';
  if (startsWith(bytes, 0, 'fLaC')) return 'flac';
  if (startsWith(bytes, 0, 'OggS')) return 'ogg';
  if (startsWith(bytes, 0, 'RIFF')) return 'wav';
  return null;
}

/** Maps a Content-Type to a format, for when the bytes are not at hand. */
export function formatFromMime(mime: string): AudioFormat | null {
  const type = mime.toLowerCase();
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a';
  if (type.includes('flac')) return 'flac';
  if (type.includes('ogg') || type.includes('opus')) return 'ogg';
  if (type.includes('wav')) return 'wav';
  return null;
}

/** A guess from the URL, used only when neither bytes nor MIME say anything. */
export function formatFromUrl(url: string): AudioFormat {
  const lower = url.toLowerCase();
  if (lower.includes('.m4a') || lower.includes('.mp4')) return 'm4a';
  if (lower.includes('.flac')) return 'flac';
  if (lower.includes('.ogg') || lower.includes('.opus')) return 'ogg';
  if (lower.includes('.wav')) return 'wav';
  if (lower.includes('.aac')) return 'aac';
  return 'mp3';
}
