import type { AiChatMessage } from './aiClient';
import { renderFactCard, type AudioFeatures } from '@/audio/analysis';

/**
 * Prompt construction for the automatic per-track commentary.
 *
 * The companion used to be handed lyrics and metadata only, while the prompt
 * asked it to cover "听感/编曲线索" - which it could only invent. Everything it
 * said about arrangement was literature, not observation, and it had no way to
 * know the difference.
 *
 * Now the measured feature card is passed through when the track has been
 * analysed, and the wording of the instructions changes with it: with a card the
 * model may interpret real numbers; without one it is told, in as many words,
 * that arrangement claims have no basis here. Kept as a pure function so both
 * branches are testable without rendering the companion.
 */

export interface CommentarySong {
  name: string;
  artist: string[];
  album?: string;
  source: string;
}

/**
 * What the user's own listening says about this track.
 *
 * The commentary used to be handed the song and nothing about its listener, so
 * every line it produced was a review - accurate, well-grounded, and addressed
 * to nobody in particular. A companion is supposed to know you have played this
 * eleven times since March; that is a fact the app already has and was simply
 * not passing on.
 */
export interface ListeningHistory {
  /** Times this track appears in the play log. */
  playCount: number;
  /** YYYY-MM-DD of the first play, when the log still reaches back that far. */
  firstPlayed?: string;
  /** YYYY-MM-DD of the most recent play. */
  lastPlayed?: string;
  favourited: boolean;
}

export interface CommentaryInput {
  /** The persona preamble (PERSONA_PROMPTS[persona]). */
  persona: string;
  song: CommentarySong;
  /** Lyric lines, already trimmed and capped; null when none were available. */
  lyric: string | null;
  /** Measured features, or null when the track could not be analysed. */
  card: AudioFeatures | null;
  /** The user's own history with this track, or null when there is none. */
  listening?: ListeningHistory | null;
}

const SHARED_RULES =
  ' 你现在是用户的自动听歌讲解员。用户刚切到这首歌，写 2-4 句自然、具体的中文点评，' +
  '最后可用一句话点出适合什么场景。不要使用列表、emoji 或提问。' +
  '严禁编造发行时间、创作背景、歌手经历等未提供的事实。';

/**
 * With measurements in hand the model may talk about sound - but only where a
 * number or a boundary backs it up. The card's own usage rules carry the detail;
 * this states the boundary of what "having heard it" licenses.
 */
const GROUNDED_RULES =
  SHARED_RULES +
  ' 这次额外给了你**本地信号分析出的实测音频数据**（速度、调性、动态曲线、音色、频段占比、结构边界）。' +
  '请优先谈这些能对应到数字或时间点的东西，例如「副歌不是靠音量，是靠 1:12 起的动态抬升」。' +
  '你依然**没有听过**这首歌：不要描述没测到的具体乐器、编制、制作手法或混音细节。';

/**
 * Without a card the honest scope is the words. The previous wording explicitly
 * invited "从歌词推断的听感/编曲线索", which is exactly the fabrication this
 * rewrite exists to stop - so it is replaced by a prohibition rather than left
 * to the model's judgement.
 */
/**
 * Appended only when there is real history to speak from.
 *
 * Phrased as permission rather than instruction: a companion that opens every
 * single time with "this is your twelfth listen" is a counter, not a companion.
 * The prohibition is the important half - the numbers given are the only ones
 * it may use, and a play count it rounds up is a lie about the user's own data.
 */
const LISTENING_RULES =
  ' 你还知道这位用户自己的播放记录（听了几次、第一次与最近一次是什么时候、是否已收藏）。' +
  '如果确实有记录，可以自然地带一句你认识他，例如「你从三月开始反复听这首」；' +
  '但**不是每次都要提**，只在它真的能支撑你的观点时才用。' +
  '**所有数字必须与给你的记录完全一致，不要四舍五入、不要推算、不要夸大。**' +
  '记录里没有的东西就不要提。';

const LYRICS_ONLY_RULES =
  SHARED_RULES +
  ' 本次**没有拿到音频实测数据**，你只能依据歌词与歌曲元数据（歌名/歌手/专辑）来谈：' +
  '歌词的主题、意象、叙事与人称，以及它直接传达的情绪。' +
  '**不要推断编曲、乐器、速度、调性或制作手法**，也不要使用"层层递进""弦乐铺陈"这类听起来具体、实际没有依据的描述。' +
  '如果没有歌词，就明确说「暂时没有拿到歌词」，只做最谨慎的判断，不要用想象补齐。';

/** Rendered only when there is something to say; an empty block reads as data. */
function listeningOf(history: ListeningHistory | null | undefined): string {
  if (!history) return '';
  const lines: string[] = [];
  if (history.playCount > 0) lines.push('播放次数：' + history.playCount);
  if (history.firstPlayed) lines.push('第一次播放：' + history.firstPlayed);
  if (history.lastPlayed) lines.push('最近一次播放：' + history.lastPlayed);
  if (history.favourited) lines.push('已收藏：是');
  if (!lines.length) return '';
  return '这位用户的播放记录：\n' + lines.join('\n');
}

function metadataOf(song: CommentarySong): string {
  return [
    '歌曲：《' + song.name + '》',
    '歌手：' + song.artist.join(' / '),
    song.album ? '专辑：' + song.album : '',
    '音源：' + song.source,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Build the system + user messages for one automatic commentary. */
export function buildCommentaryMessages(input: CommentaryInput): AiChatMessage[] {
  const { persona, song, lyric, card, listening } = input;
  const history = listeningOf(listening);
  const system =
    persona + (card ? GROUNDED_RULES : LYRICS_ONLY_RULES) + (history ? LISTENING_RULES : '');

  const parts = ['刚切到一首新歌，请开始分析。\n' + metadataOf(song)];
  if (history) parts.push('\n' + history);
  // The card goes before the lyrics: it is the part the model is asked to lead
  // with, and it is short enough that position costs nothing.
  if (card) parts.push('\n' + renderFactCard(card));
  parts.push(lyric ? '\n歌词：\n' + lyric : '\n歌词：暂无可用歌词');

  return [
    { role: 'system', content: system },
    { role: 'user', content: parts.join('\n') },
  ];
}

/** Honest status line for the message footer, so the user can tell the two apart. */
export function commentarySourceNote(card: AudioFeatures | null): string {
  return card ? '分析完成（已结合本地实测音频特征）' : '分析完成（仅基于歌词，未拿到音频实测）';
}
