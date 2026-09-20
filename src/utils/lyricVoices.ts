/**
 * Duet and backing-vocal support for lyric sheets.
 *
 * Two conventions carry almost all of this in the wild, and neither needs a
 * TTML parser to read:
 *
 *  - a leading voice tag followed by a colon (`男：` / `女：` / `合：` / `A：`),
 *    which is how Chinese sheets have marked who sings a line for years;
 *  - parenthesised asides (`（和声）`), which are backing vocals and ad-libs.
 *
 * Halcyon reads the same two ideas out of TTML agents and background spans. The
 * parsing here is deliberately separate from the rendering so both can be
 * tested - and so a sheet that uses neither convention simply comes out
 * unchanged.
 */

/** Normalised voice. `a` / `b` are the unnamed-singer tags sheets sometimes use. */
export type LyricVoice = 'male' | 'female' | 'both' | 'a' | 'b';

export type LyricSide = 'left' | 'right' | 'center';

/**
 * Which column a voice belongs in.
 *
 * Male on the left is the convention these sheets are written against - and
 * 男左女右 is the idiom behind it - so a duet laid out this way reads the way
 * the sheet was written.
 */
export function voiceSide(voice: LyricVoice | null): LyricSide {
  if (voice === 'male' || voice === 'a') return 'left';
  if (voice === 'female' || voice === 'b') return 'right';
  return 'center';
}

const VOICE_ALIASES: Record<string, LyricVoice> = {
  男: 'male',
  男声: 'male',
  M: 'male',
  MALE: 'male',
  女: 'female',
  女声: 'female',
  F: 'female',
  FEMALE: 'female',
  合: 'both',
  合唱: 'both',
  ALL: 'both',
  A: 'a',
  B: 'b',
};

const VOICE_WORDS = '男声|女声|合唱|男|女|合|MALE|FEMALE|ALL|M|F|A|B';

/** `[男]：` / `【女】` - the brackets already delimit it, so the colon is optional. */
const BRACKETED_TAG = new RegExp('^\\s*[\\[【（(]\\s*(' + VOICE_WORDS + ')\\s*[\\]】）)]\\s*[：:]?\\s*', 'i');
/** `男：` - the colon is what makes this a tag rather than lyric text. */
const BARE_TAG = new RegExp('^\\s*(' + VOICE_WORDS + ')\\s*[：:]\\s*', 'i');

/** Anything bracketed is an aside: backing vocals, ad-libs, annotations. */
const ASIDE = /[（(【]([^（()）【】]*)[)）】]/g;

export interface LyricRun {
  text: string;
  /** Backing vocal / ad-lib: rendered smaller and dimmer. */
  background: boolean;
}

export interface ParsedLyricLine {
  /** Voice tag at the start of the line, if the sheet carries one. */
  voice: LyricVoice | null;
  /** Foreground text only, with the voice tag and any asides removed. */
  text: string;
  /** The line split for rendering, spacing preserved. */
  runs: LyricRun[];
  /** A line that is nothing but an aside, e.g. `（和声）`. */
  allBackground: boolean;
}

export interface LyricVoiceAnalysis {
  /**
   * True only when the sheet actually alternates sides. A sheet where every
   * tagged line is `合：` is a chorus annotation, not a duet, and a two-column
   * layout would just look broken.
   */
  duet: boolean;
  /** Voices present, in order of first appearance. */
  voices: LyricVoice[];
  lines: ParsedLyricLine[];
}

/** Splits a leading voice tag off a line, if it has one. */
export function parseVoiceTag(raw: string): { voice: LyricVoice | null; text: string } {
  for (const pattern of [BRACKETED_TAG, BARE_TAG]) {
    const match = pattern.exec(raw);
    if (!match) continue;
    const voice = VOICE_ALIASES[match[1].toUpperCase()];
    if (voice) return { voice, text: raw.slice(match[0].length) };
  }
  return { voice: null, text: raw };
}

/**
 * Splits a line into foreground text and asides.
 *
 * Whitespace inside the line is preserved rather than trimmed per run, so the
 * rendered pieces read exactly as the sheet wrote them; the gap around an aside
 * is added by CSS instead of by injecting characters.
 */
export function splitBackgroundRuns(text: string): LyricRun[] {
  const runs: LyricRun[] = [];
  const push = (value: string, background: boolean) => {
    if (value) runs.push({ text: value, background });
  };

  let last = 0;
  for (const match of text.matchAll(ASIDE)) {
    const at = match.index ?? 0;
    push(text.slice(last, at), false);
    push(match[1], true);
    last = at + match[0].length;
  }
  push(text.slice(last), false);
  return runs;
}

export function parseLyricLine(raw: string): ParsedLyricLine {
  const tagged = parseVoiceTag(raw);
  const runs = splitBackgroundRuns(tagged.text.trim());
  const text = runs
    .filter((run) => !run.background)
    .map((run) => run.text)
    .join('')
    .trim();
  return {
    voice: tagged.voice,
    text,
    runs,
    allBackground: text === '' && runs.some((run) => run.background),
  };
}

export function analyseLyricVoices(texts: readonly string[]): LyricVoiceAnalysis {
  const lines = texts.map(parseLyricLine);
  const voices: LyricVoice[] = [];
  for (const line of lines) {
    if (line.voice && !voices.includes(line.voice)) voices.push(line.voice);
  }
  const sides = new Set(voices.map(voiceSide));
  return { duet: sides.has('left') && sides.has('right'), voices, lines };
}

/** Voice tag and asides stripped - for the mini strips and share cards. */
export function plainLyricText(raw: string): string {
  return parseLyricLine(raw).text;
}

/** The shape the one-line strips work with; structurally a `MiniLyricLine`. */
export interface PlainLyricLine {
  time: number;
  text: string;
  trans?: string;
}

/**
 * Plain-text view of a whole sheet: voice tags and backing vocals removed.
 *
 * A line that is nothing but an aside collapses to nothing, so it borrows the
 * last line that was actually sung. Dropping such lines outright would be
 * simpler but wrong: a one-line strip reading "（和声）" tells the listener
 * nothing, and blanking it is no better than leaving the previous line up.
 */
export function plainLyricLines(lines: readonly PlainLyricLine[]): PlainLyricLine[] {
  let last = '';
  return lines.map((line) => {
    const text = plainLyricText(line.text);
    if (text) last = text;
    return { ...line, text: text || last };
  });
}
