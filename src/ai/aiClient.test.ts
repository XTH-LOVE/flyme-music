import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatStreamWithFallback } from './aiClient';

/**
 * Regression tests for the per-attempt timeout policy.
 *
 * The original bug: a single `MODEL_ATTEMPT_TIMEOUT_MS = 7_500` timer covered
 * the whole attempt, including the SSE read loop. Any answer that took longer
 * than 7.5s was aborted mid-stream, the partial text was discarded via
 * `onReset`, and the next model was tried - so long answers always failed.
 *
 * The fix re-arms an idle timer on every delta (plus a generous hard ceiling),
 * so only a genuinely stalled model is dropped. These tests pin both halves of
 * that behaviour.
 */

const enc = new TextEncoder();

/** A body stream we drive by hand, which errors when the signal aborts -
 * mirroring what real `fetch` does to the response body. */
function controllableStream(signal?: AbortSignal | null) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let aborted = false;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  signal?.addEventListener(
    'abort',
    () => {
      aborted = true;
      try {
        controller.error(new DOMException('The operation was aborted.', 'AbortError'));
      } catch {
        /* already closed */
      }
    },
    { once: true },
  );
  return {
    stream,
    get aborted() {
      return aborted;
    },
    push: (text: string) => {
      // A clear diagnostic beats the raw "Invalid state: Controller is already
      // closed" that an errored stream would otherwise throw.
      if (aborted) throw new Error('stream was aborted before the test finished pushing tokens');
      controller.enqueue(enc.encode(text));
    },
    close: () => {
      if (!aborted) controller.close();
    },
  };
}

const sseDelta = (content: string) =>
  'data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n';

const jsonRes = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

describe('chatStreamWithFallback timeout policy', () => {
  let body: ReturnType<typeof controllableStream>;
  let chatRequests: number;

  /**
   * Drain pending work. Uses `advanceTimersByTimeAsync(0)` rather than a plain
   * `await Promise.resolve()` loop because vitest's fake timers also fake
   * `setImmediate`, and undici's body-stream machinery needs those macrotask
   * ticks to settle `Response.json()`. Advancing by 0ms runs them without
   * consuming any of the idle-timeout budget.
   */
  async function flush() {
    for (let i = 0; i < 8; i += 1) await vi.advanceTimersByTimeAsync(0);
  }

  /** Advance until the chat request has actually been issued. */
  async function waitForChatRequest() {
    for (let i = 0; i < 50 && chatRequests === 0; i += 1) {
      await vi.advanceTimersByTimeAsync(0);
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    // aiClient uses window.setTimeout; there is no window in the node test env.
    vi.stubGlobal('window', globalThis);
    chatRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/status')) {
          return jsonRes({ configured: true, endpoint: 'https://example.invalid', model: 'm1' });
        }
        if (url.endsWith('/models')) return jsonRes({ data: [{ id: 'm1' }] });
        chatRequests += 1;
        body = controllableStream(init?.signal);
        return new Response(body.stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps a slow but healthy stream alive well past the old 7.5s cap', async () => {
    const deltas: string[] = [];
    const pending = chatStreamWithFallback(
      { model: 'm1' },
      [{ role: 'user', content: 'hi' }],
      (d) => deltas.push(d),
    );

    await waitForChatRequest();
    expect(chatRequests).toBe(1);

    // Three 15s gaps = 45s of wall clock, far past the old 7.5s hard cap, but
    // every individual gap stays under the 20s idle budget.
    body.push(sseDelta('A'));
    await flush();
    for (const chunk of ['B', 'C']) {
      await vi.advanceTimersByTimeAsync(15_000);
      body.push(sseDelta(chunk));
      await flush();
    }
    body.push('data: [DONE]\n\n');
    body.close();

    const result = await pending;
    expect(result.model).toBe('m1');
    expect(result.text).toBe('ABC');
    expect(deltas.join('')).toBe('ABC');
    // The stream must never have been aborted at all.
    expect(body.aborted).toBe(false);
    // Exactly one attempt: the fix must not fall through to another model.
    expect(chatRequests).toBe(1);
  });

  it('drops a stream that goes silent past the idle budget', async () => {
    const pending = chatStreamWithFallback(
      { model: 'm1' },
      [{ role: 'user', content: 'hi' }],
      () => undefined,
    );
    const rejected = expect(pending).rejects.toThrow();

    await waitForChatRequest();
    expect(chatRequests).toBe(1);

    // Never emit a token: the idle timer must fire and kill the attempt.
    await vi.advanceTimersByTimeAsync(20_001);
    await rejected;
  });

  it('re-arms the idle budget on every token instead of counting from the start', async () => {
    const pending = chatStreamWithFallback(
      { model: 'm1' },
      [{ role: 'user', content: 'hi' }],
      () => undefined,
    );

    await flush();

    // 19s of silence, then a token, repeated. Each gap is just under the
    // budget, so a correct implementation survives indefinitely.
    for (let i = 0; i < 5; i += 1) {
      await vi.advanceTimersByTimeAsync(19_000);
      body.push(sseDelta('x'));
      await flush();
    }
    body.push('data: [DONE]\n\n');
    body.close();

    const result = await pending;
    expect(result.text).toBe('xxxxx');
    expect(chatRequests).toBe(1);
  });
});
