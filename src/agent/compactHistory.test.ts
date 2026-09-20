import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The wiring test: does the agent loop's compaction actually fire, and does it
 * stay out of the way when it cannot?
 *
 * `chatOnce` is mocked, because the point is not the model - it is the promise
 * that every failure path returns the *original* transcript. A compaction that
 * throws would take a working conversation down with it, and that is the one
 * outcome this module must never produce.
 */

const chatOnce = vi.fn();
vi.mock('@/ai/aiClient', () => ({
  chatOnce: (...args: unknown[]) => chatOnce(...args),
}));

const { contextUsage, maybeCompactHistory, resolveContextWindow } = await import('./compactHistory');
const { defaultCompactionPolicy } = await import('./compaction');
const { estimateTranscriptTokens } = await import('./tokens');

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

const cfg = { model: 'test-model' };

/** A transcript comfortably over the 85% line for a small window. */
function bigHistory(): Msg[] {
  return [
    { role: 'system', content: 'instructions '.repeat(20) },
    ...Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 ? 'assistant' : 'user') as 'assistant' | 'user',
      content: 'turn ' + i + ' ' + 'x'.repeat(400),
    })),
  ];
}

const SMALL_WINDOW = 1024;

/**
 * The suite runs in a node environment, so there is no localStorage. Production
 * code already survives that - `resolveContextWindow` catches and falls back -
 * but the override itself is worth testing, so it gets a stub.
 */
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
};

beforeEach(() => {
  chatOnce.mockReset();
  store.clear();
});

describe('maybeCompactHistory', () => {
  it('does nothing when the transcript is comfortably inside the window', async () => {
    const history: Msg[] = [
      { role: 'system', content: 'hi' },
      { role: 'user', content: 'hello' },
    ];
    const outcome = await maybeCompactHistory(cfg, history, { contextWindow: 100_000 });
    expect(outcome.compacted).toBe(false);
    expect(outcome.reason).toBe('below-threshold');
    expect(outcome.history).toBe(history);
    expect(chatOnce).not.toHaveBeenCalled();
  });

  it('does nothing when compaction is switched off', async () => {
    const history = bigHistory();
    const outcome = await maybeCompactHistory(cfg, history, {
      contextWindow: SMALL_WINDOW,
      policy: defaultCompactionPolicy({ enabled: false }),
    });
    expect(outcome.compacted).toBe(false);
    expect(outcome.reason).toBe('disabled');
    expect(outcome.history).toBe(history);
    expect(chatOnce).not.toHaveBeenCalled();
  });

  it('has nothing to do when the transcript is only the system prompt and the last exchange', async () => {
    const history: Msg[] = [
      { role: 'system', content: 'x'.repeat(4000) },
      { role: 'user', content: 'y'.repeat(4000) },
    ];
    const outcome = await maybeCompactHistory(cfg, history, { contextWindow: SMALL_WINDOW });
    expect(outcome.compacted).toBe(false);
    expect(outcome.reason).toBe('nothing-to-compact');
    expect(chatOnce).not.toHaveBeenCalled();
  });

  it('compacts when over the line, and the transcript gets smaller', async () => {
    const history = bigHistory();
    chatOnce.mockResolvedValue('这是一段足够短的摘要，涵盖了之前所有轮次的关键决定与标识。');

    const before = estimateTranscriptTokens(history);
    const outcome = await maybeCompactHistory(cfg, history, { contextWindow: SMALL_WINDOW });

    expect(outcome.compacted).toBe(true);
    expect(outcome.tokensAfter).toBeLessThan(outcome.tokensBefore);
    expect(estimateTranscriptTokens(outcome.history)).toBeLessThan(before);
    expect(chatOnce).toHaveBeenCalledTimes(1);
    expect(outcome.note).toContain('已压缩');
  });

  it('keeps the system prompt out of the summary and in front of the transcript', async () => {
    const history = bigHistory();
    chatOnce.mockResolvedValue('摘要摘要摘要摘要摘要摘要摘要摘要摘要摘要');
    const outcome = await maybeCompactHistory(cfg, history, { contextWindow: SMALL_WINDOW });
    expect(outcome.history[0].role).toBe('system');
    expect(outcome.history[0].content).toContain('instructions');
    // The summary must not be able to outrank the app's own instructions.
    expect(outcome.history.some((m) => m.role === 'user' && m.content.includes('摘要'))).toBe(true);
  });

  it('keeps the most recent exchange verbatim, so the current round still has its tool output', async () => {
    const history = bigHistory();
    const last = history[history.length - 1].content;
    chatOnce.mockResolvedValue('短摘要短摘要短摘要短摘要短摘要短摘要');
    const outcome = await maybeCompactHistory(cfg, history, { contextWindow: SMALL_WINDOW });
    expect(outcome.history.some((m) => m.content === last)).toBe(true);
  });

  it('passes the summary instruction to the model', async () => {
    chatOnce.mockResolvedValue('摘要摘要摘要摘要摘要摘要摘要摘要摘要摘要');
    await maybeCompactHistory(cfg, bigHistory(), { contextWindow: SMALL_WINDOW });
    const sent = chatOnce.mock.calls[0][1] as Msg[];
    expect(sent[sent.length - 1].content).toContain('摘要替换');
  });

  it('SURVIVES a model error and returns the original transcript', async () => {
    const history = bigHistory();
    chatOnce.mockRejectedValue(new Error('connection refused'));
    const outcome = await maybeCompactHistory(cfg, history, { contextWindow: SMALL_WINDOW });
    expect(outcome.compacted).toBe(false);
    expect(outcome.reason).toBe('sampler_error');
    expect(outcome.history).toBe(history);
  });

  it('SURVIVES an aborted signal', async () => {
    const history = bigHistory();
    chatOnce.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    const outcome = await maybeCompactHistory(cfg, history, { contextWindow: SMALL_WINDOW });
    expect(outcome.compacted).toBe(false);
    expect(outcome.history).toBe(history);
  });

  it('rejects an empty summary rather than wiping the conversation', async () => {
    const history = bigHistory();
    chatOnce.mockResolvedValue('   ');
    const outcome = await maybeCompactHistory(cfg, history, { contextWindow: SMALL_WINDOW });
    expect(outcome.compacted).toBe(false);
    expect(outcome.reason).toBe('empty_response');
    expect(outcome.history).toBe(history);
  });

  it('rejects a summary that did not actually save anything', async () => {
    const history = bigHistory();
    // A "summary" longer than the thing it replaces would make the prompt grow.
    chatOnce.mockResolvedValue('z'.repeat(60_000));
    const outcome = await maybeCompactHistory(cfg, history, { contextWindow: SMALL_WINDOW });
    expect(outcome.compacted).toBe(false);
    expect(outcome.reason).toBe('insufficient_reduction');
    expect(outcome.history).toBe(history);
  });

  it('reports the note through the callback as well as the return value', async () => {
    chatOnce.mockResolvedValue('摘要摘要摘要摘要摘要摘要摘要摘要摘要摘要');
    const notes: string[] = [];
    await maybeCompactHistory(cfg, bigHistory(), {
      contextWindow: SMALL_WINDOW,
      onNote: (note) => notes.push(note),
    });
    expect(notes).toHaveLength(1);
  });

  it('never throws, whatever the model does', async () => {
    for (const behaviour of [
      () => Promise.reject(new Error('boom')),
      () => Promise.resolve(''),
      () => Promise.resolve('x'.repeat(100_000)),
    ]) {
      chatOnce.mockImplementation(behaviour);
      await expect(maybeCompactHistory(cfg, bigHistory(), { contextWindow: SMALL_WINDOW })).resolves.toBeDefined();
    }
  });
});

describe('contextUsage', () => {
  it('reports tokens and a percentage', () => {
    const usage = contextUsage([{ role: 'user', content: 'x'.repeat(400) }], 1000);
    expect(usage.tokens).toBeGreaterThan(0);
    expect(usage.percent).toBeGreaterThan(0);
    expect(usage.window).toBe(1000);
  });

  it('is null for the percentage when the window is unusable', () => {
    expect(contextUsage([{ role: 'user', content: 'hi' }], 0).percent).toBeNull();
  });
});

describe('resolveContextWindow', () => {
  it('falls back to the default when nothing is stored', () => {
    expect(resolveContextWindow()).toBeGreaterThanOrEqual(1024);
  });

  it('honours a stored override', () => {
    localStorage.setItem('aurora.agent.contextWindow', '131072');
    expect(resolveContextWindow()).toBe(131072);
  });

  it('ignores a nonsense override rather than accepting a zero window', () => {
    localStorage.setItem('aurora.agent.contextWindow', '0');
    expect(resolveContextWindow()).toBeGreaterThanOrEqual(1024);
    localStorage.setItem('aurora.agent.contextWindow', 'not a number');
    expect(resolveContextWindow()).toBeGreaterThanOrEqual(1024);
  });
});
