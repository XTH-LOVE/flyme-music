import type { TimedLyricLine } from './timedLyrics';

/**
 * Normalise provider lyrics before they reach the renderer. Providers often
 * return duplicated timestamps, accidental overlaps and whitespace-only rows.
 * The function returns fresh objects so cached provider data is never mutated.
 */
export function optimizeLyricLines(input: TimedLyricLine[]): TimedLyricLine[] {
  const lines = input
    .map((line) => ({
      ...line,
      text: line.text.replace(/\s+/g, ' ').trim(),
      words: line.words?.map((word) => ({ ...word, text: word.text.replace(/\s+/g, ' ') })),
    }))
    .filter((line) => line.text.length > 0)
    .sort((a, b) => a.time - b.time);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1];
    if (line.words?.length) {
      const words = line.words.map((word, wordIndex) => {
        const nextWord = line.words?.[wordIndex + 1];
        const fallbackEnd = nextWord?.start ?? next?.time ?? word.start + 1.8;
        return {
          ...word,
          start: Math.max(line.time, word.start),
          end: Math.max(word.start + 0.04, Math.min(word.end || fallbackEnd, fallbackEnd)),
        };
      });
      line.words = words;
    }
  }

  // Remove tiny accidental overlaps while preserving intentional overlaps.
  for (let i = 0; i < lines.length - 1; i += 1) {
    const next = lines[i + 1];
    const current = lines[i];
    const end = current.words?.at(-1)?.end ?? next.time;
    const overlap = end - next.time;
    if (overlap > 0 && overlap < 0.5) {
      current.words = current.words?.map((word, index, words) => {
        if (index !== words.length - 1) return word;
        return { ...word, end: Math.max(word.start + 0.04, next.time) };
      });
    }
  }
  return lines;
}
