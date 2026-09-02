import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useAiStore, aiConfigured, nextAiMsgId } from '@/store/useAiStore';
import { chatStreamWithFallback } from '@/ai/aiClient';
import { PERSONA_PROMPTS } from '@/ai/aiTools';
import { fetchLyricLines } from '@/utils/currentLyric';

const MAX_LYRIC_LINES = 80;
const MAX_LYRIC_CHARS = 5200;
const LYRIC_TIMEOUT_MS = 2800;
const AI_TIMEOUT_MS = 18000;
const ANALYSIS_CACHE_KEY = 'aurora.ai.analysis.v1';
const ANALYSIS_CACHE_LIMIT = 40;

function cacheKey(song: { source: string; id: string | number }, model: string, persona: string) {
  return [song.source, song.id, model.trim(), persona].join(':');
}

function readAnalysisCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ANALYSIS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAnalysisCache(cache: Record<string, string>) {
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
    pushMessage({
      id: messageId,
      role: 'ai',
      kind: 'song',
      text: cached ?? (configured ? '正在读取歌词并整理这首歌…' : '开启 AI 后自动解读这首歌。'),
      streaming: configured && !cached,
      analysisStatus: cached ? 'ready' : configured ? 'pending' : 'skipped',
      tracks: [current],
    });

    if (!configured || cached) return undefined;
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
          const metadata = [
            '歌曲：《' + song.name + '》',
            '歌手：' + song.artist.join(' / '),
            song.album ? '专辑：' + song.album : '',
            '音源：' + song.source,
          ]
            .filter(Boolean)
            .join('\n');
          useAiStore.getState().updateMessage(messageId, { thought: '歌词已读完，正在组织主题和情绪线索…' });
          let streamed = '';
          const aiRequest = chatStreamWithFallback(
            { model: activeModel },
            [
              {
                role: 'system',
                content:
                  PERSONA_PROMPTS[activePersona] +
                  ' 你现在是用户的自动听歌讲解员。每次用户切到新歌，都要根据给出的歌曲资料和歌词，写 2-4 句自然、具体的中文点评。请覆盖：歌词主题或意象、情绪变化，以及能从歌词推断的听感/编曲线索；最后可用一句话点出适合什么场景。不要使用列表、emoji或提问。严禁编造发行时间、创作背景、歌手经历等未提供的事实；没有歌词时要明确说“暂时没有拿到歌词”，只基于歌曲名、歌手和专辑做谨慎判断。',
              },
              {
                role: 'user',
                content:
                  '刚切到一首新歌，请开始分析。\n' + metadata +
                  (lyric ? '\n歌词（仅取前 ' + MAX_LYRIC_LINES + ' 行）：\n' + lyric : '\n歌词：暂无可用歌词'),
              },
            ],
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
            thought: text.model !== activeModel ? `已自动切换到 ${text.model}` : '分析完成',
          });
          if (t) {
            const cache = readAnalysisCache();
            cache[keyWithConfig] = t;
            writeAnalysisCache(cache);
            // Remember the model that actually worked so the next song skips
            // the futile first attempt against a stale model name.
            if (text.model !== activeModel) {
              useAiStore.getState().setConfig({ model: text.model });
            }
          }
        } catch {
          if (!controller.signal.aborted || timedOut) {
            useAiStore.getState().updateMessage(messageId, {
              text: timedOut
                ? '自动解读超时了，稍后可以在「一起听」里重试。'
                : '这首歌的歌词暂时没加载好，稍后可以在「一起听」里重试。',
              streaming: false,
              analysisStatus: 'error',
            });
          }
        }
      })();
    }, 800);
    return () => {
      window.clearTimeout(timer);
      const pending = useAiStore.getState().messages.find((message) => message.id === messageId);
      if (pending?.streaming) {
        useAiStore.getState().updateMessage(messageId, {
          text: '已切换歌曲，这次解读已跳过。',
          streaming: false,
          analysisStatus: 'skipped',
        });
      }
      controller.abort();
      if (requestRef.current === controller) requestRef.current = null;
    };
  }, [currentKey, companion, model, persona, pushMessage, analysisRetry]);

  return null;
}
