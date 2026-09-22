import type { AiChatMessage } from './aiClient';

/**
 * Turning a description into a track list.
 *
 * The prompt and the parsing live here, apart from the call and the UI, because
 * this is where the feature actually succeeds or fails: the model has to return
 * something machine-readable, and what it returns has to survive being searched
 * for on a real music API.
 *
 * Two decisions worth stating.
 *
 * The model is asked for titles and artists, not for commentary. A response
 * with a sentence about each pick is unusable - it has to be parsed, and every
 * extra word is another way for the parse to fail.
 *
 * And it is asked for more tracks than requested. Some of what it names will
 * not be found, or will be found only as a cover, or as a karaoke version; a
 * playlist that comes back two thirds full is a worse outcome than one that had
 * to drop a few names.
 */

export interface PlaylistBrief {
  /** The user's description: a mood, an era, an activity. */
  theme: string;
  /** How many tracks to end up with. */
  size: number;
  /** Optional steer, e.g. "不要粤语" or "偏安静". */
  avoid?: string;
}

export interface RequestedTrack {
  title: string;
  artist: string;
}

/** Over-request by this much, to survive the ones that cannot be found. */
const OVERFETCH = 1.5;

export function buildPlaylistPrompt(brief: PlaylistBrief): AiChatMessage[] {
  const want = Math.min(50, Math.max(5, Math.round(brief.size * OVERFETCH)));

  const system = [
    '你是一个歌单策划。用户会用一句话描述想要的感觉，你要给出符合的歌曲清单。',
    '',
    '要求：',
    `1. 给出 ${want} 首真实存在的歌曲，宁多勿少。`,
    '2. 每首必须是真实发行过的歌，不要编造歌名或歌手。',
    '3. 优先选大众能搜到的版本，避免冷门现场版、翻唱、伴奏。',
    '4. 只输出 JSON 数组，不要任何解释、标题或 Markdown 代码块。',
    '5. 每项格式：{"title":"歌名","artist":"歌手"}',
    '',
    '只输出 JSON。',
  ].join('\n');

  const user = [
    '想要的感觉：' + brief.theme.trim(),
    brief.avoid ? '避免：' + brief.avoid.trim() : '',
  ]
    .filter(Boolean)
    .join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Reads the model's reply into track requests.
 *
 * Written defensively because the instruction to return bare JSON is a
 * preference, not a guarantee. Models wrap it in a code fence, prefix it with a
 * sentence, or return an object with a `tracks` key instead of an array - all
 * of which are recoverable, and all of which would otherwise surface to the
 * user as "AI 没有返回内容".
 */
export function parseRequestedTracks(reply: string): RequestedTrack[] {
  const text = reply.trim();
  if (!text) return [];

  // Prefer a fenced block when there is one: it is the part that was meant to
  // be machine-readable.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [fenced?.[1], text].filter((v): v is string => Boolean(v));

  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed.length) return parsed;
  }

  // Last resort: pull out anything that looks like the objects we asked for.
  // A model that narrated its picks still named them.
  return extractObjects(text);
}

function tryParse(raw: string): RequestedTrack[] {
  // The array may not start at the first character - a sentence often precedes
  // it - so both the whole string and the bracketed span are tried.
  const span = raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1);
  for (const attempt of [raw, span]) {
    if (!attempt) continue;
    try {
      const value: unknown = JSON.parse(attempt);
      const list = Array.isArray(value)
        ? value
        : isRecord(value) && Array.isArray(value.tracks)
          ? value.tracks
          : null;
      if (list) {
        const tracks = list.map(toRequested).filter((t): t is RequestedTrack => t !== null);
        if (tracks.length) return tracks;
      }
    } catch {
      /* try the next shape */
    }
  }
  return [];
}

function extractObjects(text: string): RequestedTrack[] {
  const found: RequestedTrack[] = [];
  const pattern = /\{\s*"title"\s*:\s*"([^"]+)"\s*,\s*"artist"\s*:\s*"([^"]+)"\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    found.push({ title: match[1], artist: match[2] });
  }
  return found;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toRequested(value: unknown): RequestedTrack | null {
  if (!isRecord(value)) return null;
  // `name`/`singer` and friends are common substitutions; accepting them costs
  // nothing and rescues a response that would otherwise be discarded whole.
  const title = value.title ?? value.name ?? value.song;
  const artist = value.artist ?? value.singer ?? value.artists;
  if (typeof title !== 'string' || !title.trim()) return null;
  const artistText = Array.isArray(artist)
    ? artist.filter((a): a is string => typeof a === 'string').join(' ')
    : typeof artist === 'string'
      ? artist
      : '';
  return { title: title.trim(), artist: artistText.trim() };
}
