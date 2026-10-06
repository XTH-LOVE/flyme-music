import type { TimedLyricLine } from './timedLyrics';

export type LyricTimingQuality = 'unavailable' | 'line-only' | 'word-exact' | 'word-partial';
export type LyricWordRejection =
  | 'missing'
  | 'invalid-duration'
  | 'non-monotonic'
  | 'overlap'
  | 'out-of-line-range'
  | 'text-mismatch';

export interface LyricDiagnostics {
  quality: LyricTimingQuality;
  lineCount: number;
  wordTimedLineCount: number;
  invalidLineCount: number;
  rejectedWordTiming: Partial<Record<LyricWordRejection, number>>;
}

const comparable = (value: string) => value
  .normalize('NFKC')
  .toLocaleLowerCase('en-US')
  .replace(/[\s\p{P}\p{S}]+/gu, '');

function reject(
  reasons: Partial<Record<LyricWordRejection, number>>,
  reason: LyricWordRejection,
): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

function validWords(
  line: TimedLyricLine,
  lineEnd: number,
): LyricWordRejection | null {
  const words = line.words;
  if (!words?.length) return 'missing';
  if (words.some((word) =>
    !Number.isFinite(word.start)
    || !Number.isFinite(word.end)
    || word.end <= word.start
  )) return 'invalid-duration';
  if (words.some((word, index) => index > 0 && word.start < words[index - 1].start)) {
    return 'non-monotonic';
  }
  if (words.some((word, index) =>
    index > 0 && word.start < words[index - 1].end - 0.01
  )) return 'overlap';
  if (words.some((word) => word.start < line.time - 0.05 || word.end > lineEnd + 0.05)) {
    return 'out-of-line-range';
  }
  if (comparable(words.map((word) => word.text).join('')) !== comparable(line.text)) {
    return 'text-mismatch';
  }
  return null;
}

/**
 * Inspect provider lyrics without changing what the renderer displays.
 * `durationSeconds` is optional because some providers do not report it.
 */
export function diagnoseLyrics(
  lines: TimedLyricLine[],
  durationSeconds = 0,
): LyricDiagnostics {
  const sorted = lines
    .filter((line) => line.text.trim())
    .slice()
    .sort((a, b) => a.time - b.time);
  const reasons: Partial<Record<LyricWordRejection, number>> = {};
  let invalidLineCount = 0;
  let wordTimedLineCount = 0;

  sorted.forEach((line, index) => {
    if (!Number.isFinite(line.time) || line.time < 0) {
      invalidLineCount += 1;
      return;
    }
    const next = sorted[index + 1]?.time;
    const lineEnd = Math.min(
      next ?? Number.POSITIVE_INFINITY,
      durationSeconds > line.time ? durationSeconds : Number.POSITIVE_INFINITY,
    );
    const reason = validWords(line, lineEnd);
    if (!reason) wordTimedLineCount += 1;
    else reject(reasons, reason);
    if (durationSeconds > 0 && line.time >= durationSeconds) invalidLineCount += 1;
  });

  const lineCount = sorted.filter((line) =>
    Number.isFinite(line.time) && line.time >= 0
    && (durationSeconds <= 0 || line.time < durationSeconds),
  ).length;
  const quality: LyricTimingQuality = lineCount === 0
    ? 'unavailable'
    : wordTimedLineCount === lineCount
      ? 'word-exact'
      : wordTimedLineCount > 0
        ? 'word-partial'
        : 'line-only';
  return { quality, lineCount, wordTimedLineCount, invalidLineCount, rejectedWordTiming: reasons };
}

/** Keep lyrics visible while removing only unsafe word timing. */
export function sanitizeLyricWords(
  lines: TimedLyricLine[],
  durationSeconds = 0,
): TimedLyricLine[] {
  return lines.map((line, index) => {
    const next = lines[index + 1]?.time;
    const lineEnd = Math.min(
      next ?? Number.POSITIVE_INFINITY,
      durationSeconds > line.time ? durationSeconds : Number.POSITIVE_INFINITY,
    );
    return validWords(line, lineEnd) ? { ...line, words: undefined } : line;
  });
}
