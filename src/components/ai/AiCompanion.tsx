import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useAiStore, aiConfigured, nextAiMsgId } from '@/store/useAiStore';
import { chatStreamWithFallback } from '@/ai/aiClient';
import { PERSONA_PROMPTS } from '@/ai/aiTools';
import { buildCommentaryMessages, commentarySourceNote } from '@/ai/songCommentary';
import { analyzeInBackground, readCachedCard, trackKeyOf } from '@/audio/analysis';
import { fetchLyricLines } from '@/utils/currentLyric';

const MAX_LYRIC_LINES = 80;
const MAX_LYRIC_CHARS = 5200;
const LYRIC_TIMEOUT_MS = 2800;
const AI_TIMEOUT_MS = 18000;
/**
 * How long the commentary waits for the local audio analysis before falling
 * back to lyrics-only.
 *
 * The card is what lets the model talk about sound with a basis, so it is worth
 * a bounded wait - and only a bounded one: analysis downloads and decodes the
 * whole track, and an ambient commentary must never hang on it. When the budget
 * runs out the analysis is left running (it caches the card for the next
 * listen) and the commentary proceeds honestly without it.
 */
const ANALYSIS_BUDGET_MS = 6000;
const ANALYSIS_CACHE_KEY = 'aurora.ai.analysis.v1';
const ANALYSIS_CACHE_LIMIT = 40;

function cacheKey(song: { source: string; id: string | number }, model: string, persona: string) {
  return [song.source, song.id, model.trim(), persona].join(':');
}

/**
 * A cached commentary plus the basis it was written on.
 *
 * The basis is stored with the text rather than folded into the key, because a
 * commentary written without measured audio should be upgraded once the track
 * has been analysed - not frozen for as long as the cache lives. That matters
 * in practice: analysis is skipped on metered connections and while the setting
 * is off, so a first listen can easily leave a lyrics-only entry behind.
 *
 * Entries written before this field existed are plain strings; they read as
 * ungrounded, which is exactly what they were.
 */
interface CachedCommentary {
  text: string;
  grounded: boolean;
}

function readAnalysisCache(): Record<string, CachedCommentary> {
  try {
    const raw = localStorage.getItem(ANALYSIS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, CachedCommentary> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') {
        out[key] = { text: value, grounded: false };
      } else if (value && typeof value === 'object') {
        const entry = value as Partial<CachedCommentary>;
        if (typeof entry.text === 'string') {
          out[key] = { text: entry.text, grounded: Boolean(entry.grounded) };
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeAnalysisCache(cache: Record<string, CachedCommentary>) {
  try {
    const entries = Object.entries(cache).slice(-ANALYSIS_CACHE_LIMIT);
    localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* cache is an optional optimization */
  }
}

/**
 * Headless companion engine (mounted in AppLayout).
 * On every track change it adds a "now playing" card to the listen-together
 * timeline and, when configured, a lyric-aware analysis a short moment later.
 */
export function AiCompanion() {
  const companion = useAiStore((s) => s.companion);
  const model = useAiStore((s) => s.model);
  const persona = useAiStore((s) => s.persona);
  const analysisRetry = useAiStore((s) => s.analysisRetry);
  const pushMessage = useAiStore((s) => s.pushMessage);
  const currentKey = usePlayerStore((s) =>
    s.current ? s.current.source + ':' + s.current.id : null,
  );
  const lastKey = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const configRef = useRef({ model, persona });
  configRef.current = { model, persona };

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    const current = usePlayerStore.getState().current;
    if (!current) return undefined;
    const key = current.source + ':' + current.id;
    const requestKey = key + ':' + model.trim() + ':' + persona + ':' + companion;
    if (lastKey.current === requestKey && analysisRetry === 0) return undefined;
    lastKey.current = requestKey;

    const messageId = nextAiMsgId();
    const { model: activeModel, persona: activePersona } = configRef.current;
    const configured = companion && aiConfigured({ model: activeModel });
    const keyWithConfig = cacheKey(current, activeModel, activePersona);
    const cached = configured ? readAnalysisCache()[keyWithConfig] : undefined;
    const cachedText = cached?.text;
    pushMessage({
      id: messageId,
      role: 'ai',
      kind: 'song',
      text: cachedText ?? (configured ? '正在读取歌词并整理这首歌…' : '开启 AI 后自动解读这首歌。'),
      streaming: configured && !cachedText,
      analysisStatus: cachedText ? 'ready' : configured ? 'pending' : 'skipped',
      tracks: [current],
    });

    // A cached commentary is only worth keeping as-is when it already had
    // measurements to work from. An ungrounded one is re-run, because the
    // track may well have been analysed since it was written.
    const upgrading = Boolean(cachedText && !cached?.grounded);
    if (!configured || (cachedText && !upgrading)) {
      // The commentary itself is settled, but its measured sections are still
      // worth attaching: the jump affordance should survive a replay too.
      if (configured && cachedText) {
        void readCachedCard(trackKeyOf(current)).then((card) => {
          if (card?.sections?.length) {
            useAiStore.getState().updateMessage(messageId, { sections: card.sections });
          }
        });
      }
      return undefined;
    }
    const song = current;
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = window.setTimeout(() => {
      void (async () => {
        let timedOut = false;
        try {
          // Lyrics are useful context, but a slow provider must never hold the
          // companion response indefinitely. Continue with metadata on timeout.
          const lyricRequest = fetchLyricLines(song).catch(() => []);
          const lines = await Promise.race([
            lyricRequest,
            new Promise<Awaited<typeof lyricRequest>>((resolve) =>
              window.setTimeout(() => resolve([]), LYRIC_TIMEOUT_MS),
            ),
          ]);
          const lyric = lines
            .map((line) => line.text.trim())
            .filter(Boolean)
            .slice(0, MAX_LYRIC_LINES)
            .join('\n')
            .slice(0, MAX_LYRIC_CHARS);

          // Measured facts, if this track has them. A cache hit is free, so a
          // song heard before gets a grounded commentary at no extra latency;
          // otherwise the analysis gets a bounded budget and the commentary
          // falls back to an honest lyrics-only scope rather than waiting on it.
          let card = await readCachedCard(trackKeyOf(song));
          if (!card && !controller.signal.aborted) {
            useAiStore.getState().updateMessage(messageId, { thought: '正在本地实测这首歌的音频…' });
            card = await Promise.race([
              analyzeInBackground(song),
              new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ANALYSIS_BUDGET_MS)),
            ]);
          }
          if (controller.signal.aborted) return;
          // Carry the measured boundaries onto the message so the commentary
          // can offer a jump instead of leaving the user to scrub for it.
          if (card?.sections?.length) {
            useAiStore.getState().updateMessage(messageId, { sections: card.sections });
          }
          // Upgrading an existing commentary is only worth it if there is
          // something new to say; otherwise the text on screen already stands.
          if (upgrading && !card) {
            useAiStore.getState().updateMessage(messageId, {
              text: cachedText,
              streaming: false,
              analysisStatus: 'ready',
              thought: commentarySourceNote(null),
            });
            return;
          }
          if (upgrading) useAiStore.getState().updateMessage(messageId, { streaming: true });
          useAiStore.getState().updateMessage(messageId, {
            thought: card ? '实测数据已就绪，正在组织解读…' : '歌词已读完，正在组织主题和情绪线索…',
          });
          let streamed = '';
          const aiRequest = chatStreamWithFallback(
            { model: activeModel },
            buildCommentaryMessages({
              persona: PERSONA_PROMPTS[activePersona],
              song,
              lyric: lyric || null,
              card,
            }),
            (delta) => {
              streamed += delta;
              useAiStore.getState().updateMessage(messageId, { text: streamed, streaming: true });
            },
            {
              onThought: () => useAiStore.getState().updateMessage(messageId, { thought: '正在整理歌曲的主题、情绪与听感…' }),
              onModel: (name, index) => useAiStore.getState().updateMessage(messageId, { thought: index ? `首选模型不可用，已切换到 ${name}` : `正在使用 ${name} 分析…` }),
              onReset: () => { streamed = ''; useAiStore.getState().updateMessage(messageId, { text: '', thought: '正在用备用模型重新分析…' }); },
            },
            controller.signal,
          );
          const text = await Promise.race([
            aiRequest,
            new Promise<Awaited<typeof aiRequest>>((_, reject) =>
              window.setTimeout(() => {
                timedOut = true;
                controller.abort();
                reject(new Error('自动解读超时'));
              }, AI_TIMEOUT_MS),
            ),
          ]);
          const t = text.text.trim();
          useAiStore.getState().updateMessage(messageId, {
            text: t || '暂时没整理好这首歌的点评，稍后可以在「一起听」里重试。',
            streaming: false,
            analysisStatus: t ? 'ready' : 'error',
            // Say which basis the commentary had: the two read very differently
            // and the user cannot tell them apart from the prose alone.
            thought: text.model !== activeModel
              ? '已自动切换到 ' + text.model + '；' + commentarySourceNote(card)
              : commentarySourceNote(card),
          });
          if (t) {
            const cache = readAnalysisCache();
            cache[keyWithConfig] = { text: t, grounded: Boolean(card) };
            writeAnalysisCache(cache);
            // Remember the model that actually worked so the next song skips
            // the futile first attempt against a stale model name.
            if (text.model !== activeModel) {
              useAiStore.getState().setConfig({ model: text.model });
            }
          }
        } catch {
          if (!controller.signal.aborted || timedOut) {
            // A failed upgrade must not destroy the commentary already shown.
            if (upgrading && cachedText) {
              useAiStore.getState().updateMessage(messageId, {
                text: cachedText,
                streaming: false,
                analysisStatus: 'ready',
                thought: commentarySourceNote(null),
              });
            } else {
              useAiStore.getState().updateMessage(messageId, {
                text: timedOut
                  ? '自动解读超时了，稍后可以在「一起听」里重试。'
                  : '这首歌的歌词暂时没加载好，稍后可以在「一起听」里重试。',
                streaming: false,
                analysisStatus: 'error',
              });
            }
          }
        }
      })();
    }, 800);
    return () => {
      window.clearTimeout(timer);
      const pending = useAiStore.getState().messages.find((message) => message.id === messageId);
      if (pending?.streaming) {
        // Switching tracks mid-upgrade should leave the commentary that was
        // already on screen, not replace it with a "skipped" notice.
        useAiStore.getState().updateMessage(
          messageId,
          upgrading && cachedText
            ? { text: cachedText, streaming: false, analysisStatus: 'ready', thought: commentarySourceNote(null) }
            : { text: '已切换歌曲，这次解读已跳过。', streaming: false, analysisStatus: 'skipped' },
        );
      }
      controller.abort();
      if (requestRef.current === controller) requestRef.current = null;
    };
  }, [currentKey, companion, model, persona, pushMessage, analysisRetry]);

  return null;
}
