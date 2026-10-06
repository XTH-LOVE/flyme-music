export interface TimedLyricWord {
  text: string;
  start: number;
  end: number;
}

export interface TimedLyricLine {
  time: number;
  text: string;
  trans?: string;
  words?: TimedLyricWord[];
}

function timeInSeconds(value: string | null): number | null {
  if (!value) return null;
  const parts = value.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const secondsPart = parts[parts.length - 1].match(/^(\d{1,2})(?:[.:](\d{1,3}))?$/);
  if (!secondsPart) return null;
  const seconds = Number(secondsPart[1]);
  const fraction = Number((secondsPart[2] ?? '').padEnd(3, '0')) / 1000;
  const minutes = Number(parts[parts.length - 2]);
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  if (!Number.isFinite(minutes) || !Number.isFinite(hours) || minutes > 59 || seconds > 59) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

function lineTimesAndText(raw: string): { times: number[]; text: string } | null {
  const matches = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
  if (!matches.length) return null;
  const times = matches.map((match) => {
    const fraction = Number((match[3] ?? '').padEnd(3, '0')) / 1000;
    return Number(match[1]) * 60 + Number(match[2]) + fraction;
  });
  const last = matches[matches.length - 1];
  const text = raw.slice((last.index ?? 0) + last[0].length).trim();
  return { times, text };
}

function enhancedWords(text: string, lineTime: number): { text: string; words?: TimedLyricWord[] } {
  const clockTags = [...text.matchAll(/<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>/g)].map((match) => ({
    index: match.index ?? 0,
    raw: match[0],
    start: Number(match[1]) * 60 + Number(match[2]) + Number((match[3] ?? '').padEnd(3, '0')) / 1000,
  }));
  const offsetTags = [...text.matchAll(/<(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)>/g)].map((match) => ({
    index: match.index ?? 0,
    raw: match[0],
    start: lineTime + Number(match[1]) / 1000,
  }));
  const tags = clockTags.length ? clockTags : offsetTags;
  if (!tags.length) return { text };

  const segments: Array<{ start: number; text: string }> = [];
  const first = tags[0];
  const prefix = text.slice(0, first.index ?? 0);
  if (prefix) segments.push({ start: lineTime, text: prefix });

  for (let i = 0; i < tags.length; i += 1) {
    const tag = tags[i];
    const next = tags[i + 1];
    const from = tag.index + tag.raw.length;
    const to = next?.index ?? text.length;
    segments.push({ start: tag.start, text: text.slice(from, to) });
  }

  const words = segments.filter((part) => part.text.length > 0).map((part, index, all) => ({
    text: part.text,
    start: part.start,
    end: all[index + 1]?.start ?? part.start + 1.8,
  }));
  return {
    text: segments.map((part) => part.text).join('').trim(),
    words: words.length ? words : undefined,
  };
}

/** Parse standard or enhanced LRC, keeping word timestamps when they exist. */
export function parseTimedLrc(content: string): TimedLyricLine[] {
  if (!content) return [];
  const rows = content
    .split(/\r?\n/)
    .flatMap((raw) => {
      const parsed = lineTimesAndText(raw);
      if (!parsed?.text) return [];
      return parsed.times.map((time) => {
        const enhanced = enhancedWords(parsed.text, time);
        return { time, text: enhanced.text, words: enhanced.words };
      });
    })
    .sort((a, b) => a.time - b.time);

  return rows.map((line, lineIndex) => {
    if (!line.words?.length) return line;
    const nextLineTime = rows.slice(lineIndex + 1).find((next) => next.time > line.time)?.time;
    const words = line.words.map((word, wordIndex, lineWords) => {
      const nextWord = lineWords[wordIndex + 1];
      const fallbackEnd = nextWord?.start ?? (nextLineTime && nextLineTime > word.start
        ? nextLineTime
        : word.start + 1.8);
      return { ...word, end: Math.max(word.start + 0.04, Math.min(word.end, fallbackEnd)) };
    });
    return { ...line, words };
  });
}

function parseTtmlTime(value: string | null): number | null {
  if (!value) return null;
  const seconds = value.trim().match(/^(\d+(?:\.\d+)?)s$/);
  return seconds ? Number(seconds[1]) : timeInSeconds(value);
}

/**
 * Parse a local TTML lyric sheet. The player only imports the user's selected
 * file; this does not upload or persist the lyric anywhere.
 */
export function parseTimedLyricFile(content: string): TimedLyricLine[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (!trimmed.startsWith('<')) return parseTimedLrc(trimmed);
  if (typeof DOMParser === 'undefined') throw new Error('当前环境无法读取 TTML 歌词文件');

  const document = new DOMParser().parseFromString(trimmed, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) {
    throw new Error('TTML 文件格式无效');
  }

  const paragraphs = Array.from(document.getElementsByTagNameNS('*', 'p'));
  const rows = paragraphs.flatMap((paragraph) => {
    const spans = Array.from(paragraph.children).filter((element) => element.localName === 'span');
    const timedSpans = spans.flatMap((span) => {
      const start = parseTtmlTime(span.getAttribute('begin'));
      const text = span.textContent ?? '';
      return start === null || !text ? [] : [{
        start,
        end: parseTtmlTime(span.getAttribute('end')),
        text,
      }];
    });
    const text = (paragraph.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return [];

    const time = parseTtmlTime(paragraph.getAttribute('begin')) ?? timedSpans[0]?.start ?? 0;
    if (!timedSpans.length) return [{ time, text }];

    const words = timedSpans.map((word, index) => {
      const nextStart = timedSpans[index + 1]?.start;
      return {
        text: word.text,
        start: word.start,
        end: Math.max(word.start + 0.04, word.end ?? nextStart ?? word.start + 1.8),
      };
    });
    return [{ time, text, words }];
  });

  return rows.sort((a, b) => a.time - b.time);
}
