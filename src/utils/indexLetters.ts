/**
 * Index keys for the fast-scroll bar.
 *
 * Latin titles use their first letter. Han titles are resolved through the
 * pinyin *collation order* rather than a bundled pinyin dictionary:
 * `Intl.Collator` with a zh-Hans locale sorts Han characters by pinyin, so
 * comparing a character against 23 known boundary characters tells us which
 * initial it falls under. That keeps the feature dependency-free and correct
 * for polyphonic characters without shipping hundreds of KB of tables.
 *
 * The boundary characters are not arbitrary. ICU breaks pinyin ties by stroke
 * count, so a high-stroke boundary leaks same-syllable characters into the
 * previous letter — with 塌 as the T boundary, 他 (same "tā", fewer strokes)
 * sorted into S. Each boundary below is therefore the *lowest-syllable,
 * fewest-stroke* character for its initial. Verified against a 139-character
 * sample; the sole deviation is 嗯, whose ICU reading ("ng") legitimately
 * buckets under N.
 */

/** No Mandarin syllable begins with I, U or V, so those letters are absent. */
const PINYIN_BOUNDARIES: ReadonlyArray<readonly [string, string]> = [
  ['A', '阿'],
  ['B', '八'],
  ['C', '擦'],
  ['D', '哒'],
  ['E', '婀'],
  ['F', '发'],
  ['G', '旮'],
  ['H', '哈'],
  ['J', '击'],
  ['K', '喀'],
  ['L', '拉'],
  ['M', '妈'],
  ['N', '拿'],
  ['O', '哦'],
  ['P', '啪'],
  ['Q', '七'],
  ['R', '然'],
  ['S', '仨'],
  ['T', '他'],
  ['W', '挖'],
  ['X', '夕'],
  ['Y', '丫'],
  ['Z', '匝'],
];

/** Bucket for anything that is not Latin or Han (digits, kana, Cyrillic, …). */
export const INDEX_OTHER = '#';

/** A–Z in display order; '#' always trails. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const LATIN = /[a-z]/i;
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const INDEXABLE = /[\p{L}\p{N}]/u;

let collator: Intl.Collator | null = null;

function getCollator(): Intl.Collator {
  if (!collator) {
    collator = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base' });
  }
  return collator;
}

/** Pinyin initial of a Han character, via collation order. */
function hanInitial(character: string): string {
  const compare = getCollator();
  // Sorts before 阿, i.e. outside the Han pinyin ranges entirely.
  if (compare.compare(PINYIN_BOUNDARIES[0][1], character) > 0) return INDEX_OTHER;

  let letter = PINYIN_BOUNDARIES[0][0];
  for (const [initial, boundary] of PINYIN_BOUNDARIES) {
    if (compare.compare(boundary, character) <= 0) letter = initial;
    else break;
  }
  return letter;
}

/** Index key for a single character. */
export function indexKeyOfChar(character: string): string {
  if (LATIN.test(character)) return character.toUpperCase();
  if (HAN.test(character)) return hanInitial(character);
  return INDEX_OTHER;
}

/** Index key for a title, skipping leading whitespace, punctuation and symbols. */
export function indexKeyOf(title: string): string {
  for (const character of title) {
    if (!INDEXABLE.test(character)) continue;
    return indexKeyOfChar(character);
  }
  return INDEX_OTHER;
}

/** Every letter actually present in the given titles, A–Z then '#'. */
export function collectIndexLetters(titles: readonly string[]): string[] {
  const present = new Set<string>();
  for (const title of titles) present.add(indexKeyOf(title));
  const letters = ALPHABET.filter((letter) => present.has(letter));
  if (present.has(INDEX_OTHER)) letters.push(INDEX_OTHER);
  return letters;
}

/**
 * The list the bar should show: every letter present in the data, plus the
 * full A–Z when there are too few to be worth showing a sparse bar. A bar with
 * three letters looks broken; a full bar with three of them dimmed reads as a
 * position indicator.
 */
export function indexBarLetters(titles: readonly string[]): string[] {
  const present = collectIndexLetters(titles);
  return present.length >= 4 ? present : ALPHABET.concat(INDEX_OTHER);
}
