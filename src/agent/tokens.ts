/**
 * Token estimation and context-window arithmetic for the in-app agent.
 *
 * Ported from Grok Build's `xai-token-estimation` crate, which is the single
 * source of truth in that codebase for everything that talks about context
 * usage. Flyme's agent had no accounting at all: `history` grew until the
 * model started truncating it from the front, silently and without telling
 * anyone which instructions it had just dropped.
 *
 * The reason to keep this in one module is that a token *display* and a token
 * *gate* must agree. When they do not, the UI says "85%" while the gate computes
 * 84% and does nothing.
 */

/**
 * Bytes per token under the character-based heuristic.
 *
 * No tokeniser. The estimate is wrong by a few percent on prose and by more on
 * CJK, and that is fine for a budget: it is a gauge, not an invoice. A real
 * tokeniser would be 200 KB of vocabulary shipped to a music player.
 */
export const BYTES_PER_TOKEN = 4;

/** Approximate cost of one low-resolution image patch set. */
export const IMAGE_TOKEN_ESTIMATE = 765;

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

/** UTF-8 byte length, without depending on Node's Buffer. */
function byteLength(text: string): number {
  if (encoder) return encoder.encode(text).length;
  // Fallback for an environment without TextEncoder: count code points, then
  // weight them the way UTF-8 would.
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** Bytes/4 estimate of a string's token count. */
export function estimateTokens(text: unknown): number {
  if (typeof text !== 'string' || !text) return 0;
  return Math.floor(byteLength(text) / BYTES_PER_TOKEN);
}

/** Inverse: a token budget as a byte budget. */
export function estimateChars(tokens: number): number {
  return Number.isFinite(tokens) && tokens > 0 ? Math.floor(tokens) * BYTES_PER_TOKEN : 0;
}

/** Token estimate for `count` images. */
export function estimateImageTokens(count: number): number {
  return Number.isFinite(count) && count > 0 ? Math.floor(count) * IMAGE_TOKEN_ESTIMATE : 0;
}

function saturatingMul(a: number, b: number): number {
  const product = a * b;
  return Number.isFinite(product) && Math.abs(product) <= Number.MAX_SAFE_INTEGER
    ? product
    : Number.MAX_SAFE_INTEGER;
}

/**
 * Usage as a float clamped to 100, or null when the window is unknown.
 *
 * Null rather than zero, for the same reason an absent cost is not `$0.00`: a
 * percentage of a window nobody knows is not a number, and returning 0 would
 * put "0% full" on screen next to a window that might be full.
 */
export function usagePercentage(used: number, total: number): number | null {
  if (!(total > 0) || !(used >= 0)) return null;
  return Math.min(100, (used / total) * 100);
}

/**
 * Usage percentage for DISPLAY: rounded.
 *
 * Two of these exist on purpose. This one is what a human reads; the truncating
 * one below is what the gate compares against. A display that rounds up while a
 * gate truncates down is how a row ends up reading "85%" next to a compaction
 * that never happened.
 */
export function usagePercentForDisplay(used: number, total: number): number | null {
  const pct = usagePercentage(used, total);
  return pct === null ? null : Math.round(pct);
}

/**
 * Usage percentage for GATING: truncated, integer arithmetic.
 *
 * The contract this exists to satisfy:
 *
 *   exceedsThreshold(used, total, pct) === (usagePercentForGate(used, total) ?? -1) >= pct
 */
export function usagePercentForGate(used: number, total: number): number | null {
  if (!(total > 0) || !(used >= 0)) return null;
  return Math.min(100, Math.floor((used * 100) / total));
}

export function freeTokens(total: number, used: number): number {
  return Math.max(0, total - used);
}

/**
 * Whether the window is at or past `thresholdPercent`.
 *
 * Integer form on purpose: `used / total >= pct / 100` introduces a float
 * division whose rounding differs from the integer comparison, and the two
 * disagree exactly at the boundary - the only place a threshold matters.
 *
 * `>=`, so a window exactly on the line fires.
 */
export function exceedsThreshold(used: number, total: number, thresholdPercent: number): boolean {
  if (!(total > 0)) return false;
  return saturatingMul(used, 100) >= saturatingMul(total, thresholdPercent);
}

/**
 * As above, firing early by `headroom` tokens.
 *
 * The headroom is scaled by 100 into the same integer comparison rather than
 * added to `used`: `used + headroom >= limit` mixes units and drifts on the
 * floor-divide cases.
 */
export function exceedsThresholdWithHeadroom(
  used: number,
  total: number,
  thresholdPercent: number,
  headroom: number,
): boolean {
  if (!(total > 0)) return false;
  const limit = saturatingMul(total, thresholdPercent) - saturatingMul(headroom, 100);
  return saturatingMul(used, 100) >= Math.max(0, limit);
}

/** Per-message overhead: every message carries a handful of delimiter tokens. */
export const MESSAGE_OVERHEAD_TOKENS = 4;

/** The subset of a chat message this module needs. */
export interface CountableMessage {
  role: string;
  content: string;
}

export function estimateMessageTokens(message: CountableMessage | null | undefined): number {
  if (!message || typeof message !== 'object') return 0;
  return MESSAGE_OVERHEAD_TOKENS + estimateTokens(message.content);
}

export function estimateTranscriptTokens(messages: readonly CountableMessage[] | null | undefined): number {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const message of messages) total += estimateMessageTokens(message);
  return total;
}

/** Compact display: 842, 48.2k, 1.24M. */
export function formatTokens(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) {
    const k = value / 1000;
    return (k < 10 ? k.toFixed(1) : String(Math.round(k))) + 'k';
  }
  const m = value / 1_000_000;
  return (m < 10 ? m.toFixed(2) : String(Math.round(m))) + 'M';
}
