import { isTauri } from '@/lib/apiTransport';

export interface AiConfig {
  model: string;
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function aiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch('/api/ai' + path, init);
}

interface AiChunk {
  delta?: string | null;
  thought?: string | null;
  done: boolean;
  error?: string | null;
}

async function invokeAi<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

/** Packaged-app path: Rust owns the key and streams deltas over a Channel. */
async function tauriChat(
  body: Record<string, unknown>,
  onDelta: (delta: string) => void,
  onThought?: (thought: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { Channel } = await import('@tauri-apps/api/core');
  const channel = new Channel<AiChunk>();
  let full = '';
  let failed: string | null = null;
  let stopped = false;
  channel.onmessage = (chunk) => {
    if (stopped) return;
    if (chunk.error) {
      failed = chunk.error;
      return;
    }
    if (chunk.thought) onThought?.(chunk.thought);
    if (chunk.delta) {
      full += chunk.delta;
      onDelta(chunk.delta);
    }
    if (chunk.done) stopped = true;
  };
  await Promise.race([
    invokeAi<void>('ai_chat_completions', {
      body: JSON.stringify({ ...body, stream: true }),
      onChunk: channel,
    }),
    new Promise<void>((_resolve, reject) => {
      const onAbort = () => {
        stopped = true;
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
    }),
  ]);
  if (failed) throw new Error(failed);
  return full;
}

export interface AiStatus {
  configured: boolean;
  endpoint: string;
  model: string;
}

/**
 * Idle timeout: the longest a single attempt may go *without producing a
 * token* before we give up on that model and fall through to the next one.
 * The timer is re-armed on every delta, so a long answer that keeps streaming
 * is never cut off - only a genuinely stalled one is.
 */
const MODEL_IDLE_TIMEOUT_MS = 20_000;
/**
 * Absolute ceiling per attempt. Guards against a model that dribbles one token
 * just often enough to keep resetting the idle timer forever.
 */
const MODEL_TOTAL_TIMEOUT_MS = 180_000;

export async function getAiStatus(): Promise<AiStatus> {
  if (isTauri()) return invokeAi<AiStatus>('ai_status');
  const res = await aiFetch('/status', { method: 'GET' });
  if (!res.ok) throw new Error('AI 状态 HTTP ' + res.status);
  return (await res.json()) as AiStatus;
}

/** GET /models - list available model ids on the configured endpoint. */
export async function listAiModels(_cfg?: AiConfig): Promise<string[]> {
  if (isTauri()) {
    try {
      return await invokeAi<string[]>('ai_models');
    } catch {
      return [];
    }
  }
  const res = await aiFetch('/models', { method: 'GET' });
  if (!res.ok) throw new Error('模型列表 HTTP ' + res.status);
  const json = (await res.json()) as { data?: { id?: string }[] };
  return (json.data ?? [])
    .map((m) => m.id ?? '')
    .filter(Boolean)
    .sort();
}

/**
 * Streaming chat completion (SSE). Calls onDelta per token chunk and
 * resolves with the full text. Throws on HTTP / network errors.
 */
export async function chatStream(
  cfg: AiConfig,
  messages: AiChatMessage[],
  onDelta: (delta: string) => void,
  onThought?: (thought: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (isTauri()) {
    return tauriChat(
      { model: cfg.model, messages, temperature: 0.8, max_tokens: 2400 },
      onDelta,
      onThought,
      signal,
    );
  }
  const res = await aiFetch('/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: true,
      temperature: 0.8,
      max_tokens: 2400,
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error('AI HTTP ' + res.status + (detail ? ': ' + detail.slice(0, 160) : ''));
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? '';
    if (text) onDelta(text);
    return text;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  let streamDone = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') {
        streamDone = true;
        break;
      }
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string; reasoning_content?: string; reasoning?: string } }[];
        };
        const deltaInfo = json.choices?.[0]?.delta;
        const thought = deltaInfo?.reasoning_content ?? deltaInfo?.reasoning ?? '';
        if (thought) onThought?.(thought);
        const delta = deltaInfo?.content ?? '';
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        /* keep-alive chunk */
      }
    }
    if (streamDone) break;
  }
  return full;
}

/** Stream with automatic fallback across the configured model list. */
export async function chatStreamWithFallback(
  cfg: AiConfig,
  messages: AiChatMessage[],
  onDelta: (delta: string) => void,
  options: { onThought?: (thought: string) => void; onModel?: (model: string, index: number) => void; onReset?: () => void } = {},
  signal?: AbortSignal,
): Promise<{ text: string; model: string }> {
  const [statusResult, modelsResult] = await Promise.allSettled([
    getAiStatus(),
    listAiModels(cfg),
  ]);
  // Keep the user's choice first, then the server's known default. The latter
  // prevents an old locally saved model from delaying every request.
  const statusModel = statusResult.status === 'fulfilled' && statusResult.value.configured
    ? statusResult.value.model.trim()
    : '';
  const available = modelsResult.status === 'fulfilled' ? modelsResult.value : [];
  const models = Array.from(new Set([
    cfg.model.trim(),
    statusModel,
    ...available.filter(Boolean),
  ].filter(Boolean)));
  if (!models.length) throw new Error('服务端没有配置可用的 AI 模型');
  let lastError: unknown;
  for (let i = 0; i < models.length; i += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const model = models[i];
    options.onModel?.(model, i);
    if (i > 0) options.onReset?.();
    const attemptController = new AbortController();
    const abortAttempt = () => attemptController.abort();
    signal?.addEventListener('abort', abortAttempt, { once: true });
    // Idle timer re-arms on every token; total timer is a hard ceiling.
    let idleTimer = 0;
    const armIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(abortAttempt, MODEL_IDLE_TIMEOUT_MS);
    };
    armIdle();
    const totalTimer = window.setTimeout(abortAttempt, MODEL_TOTAL_TIMEOUT_MS);
    const onDeltaWithKeepAlive = (delta: string) => {
      armIdle();
      onDelta(delta);
    };
    try {
      const text = await chatStream(
        { model },
        messages,
        onDeltaWithKeepAlive,
        options.onThought,
        attemptController.signal,
      );
      if (text.trim()) return { text, model };
      lastError = new Error('模型返回空内容');
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    } finally {
      window.clearTimeout(idleTimer);
      window.clearTimeout(totalTimer);
      signal?.removeEventListener('abort', abortAttempt);
    }
  }
  throw (lastError instanceof Error ? lastError : new Error('没有可用的 AI 模型'));
}

/** Non-streaming short completion (companion comments etc.). */
export async function chatOnce(
  cfg: AiConfig,
  messages: AiChatMessage[],
  signal?: AbortSignal,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const maxTokens = opts?.maxTokens ?? 120;
  const temperature = opts?.temperature ?? 0.9;
  if (isTauri()) {
    return tauriChat(
      { model: cfg.model, messages, temperature, max_tokens: maxTokens },
      () => undefined,
      undefined,
      signal,
    );
  }
  const res = await aiFetch('/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: false,
      temperature,
      max_tokens: maxTokens,
    }),
    signal,
  });
  if (!res.ok) throw new Error('AI HTTP ' + res.status);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? '';
}