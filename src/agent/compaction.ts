/**
 * Context compaction for the in-app agent.
 *
 * Ported from Grok Build's `xai-grok-compaction`. Flyme's agent loop runs up
 * to six rounds, each of which appends the model's output *and* a block of tool
 * observations - a `search_tracks` result is twenty tracks of JSON. On a small
 * local model with an 8k or 16k window that is enough to push the system prompt
 * out of the front of the context, and the failure is invisible: the agent just
 * starts ignoring its instructions.
 *
 * Three ideas carry the design:
 *
 *   1. **Two thresholds, not one.** Trigger at 85%, compact down to 50%. A
 *      compaction that only gets back under the trigger line is undone by the
 *      next two rounds, and each one costs a model call.
 *   2. **The gate reads the prompt about to be sent, not the session total.**
 *      Only the former predicts whether the next request will overflow.
 *   3. **Failure is never fatal.** If compaction fails the round continues
 *      uncompacted, which is exactly where it was before compaction existed.
 */

import { estimateTranscriptTokens, formatTokens, type CountableMessage } from './tokens';

export const COMPACTION_MODES = ['full-replace', 'steps-only'] as const;
export type CompactionMode = (typeof COMPACTION_MODES)[number];

export const DEFAULT_TRIGGER_PERCENT = 85;
export const DEFAULT_TARGET_PERCENT = 50;
export const DEFAULT_MIN_STEPS = 3;

/**
 * How much smaller the result must be, as a fraction of the input.
 *
 * A summary that saves 2% is not worth the call that produced it, and accepting
 * one would make the gate fire again immediately.
 */
export const DEFAULT_MIN_REDUCTION_RATIO = 0.2;

export interface CompactionPolicy {
  enabled: boolean;
  mode: CompactionMode;
  triggerThresholdPercent: number;
  targetThresholdPercent: number;
  minStepsBeforeCompact: number;
  minReductionRatio: number;
  /** Recent messages kept verbatim. */
  keepRecent: number;
}

export function defaultCompactionPolicy(over: Partial<CompactionPolicy> = {}): CompactionPolicy {
  return {
    enabled: true,
    mode: 'full-replace',
    triggerThresholdPercent: DEFAULT_TRIGGER_PERCENT,
    targetThresholdPercent: DEFAULT_TARGET_PERCENT,
    minStepsBeforeCompact: DEFAULT_MIN_STEPS,
    minReductionRatio: DEFAULT_MIN_REDUCTION_RATIO,
    keepRecent: 4,
    ...over,
  };
}

/**
 * Why a compaction did not happen.
 *
 * Separate codes rather than one `failed`, so that "there was nothing worth
 * compacting" and "the summariser fell over" do not look the same in a log.
 * The first is normal; the second is a bug.
 */
export const COMPACTION_FAILURES = {
  NOTHING_TO_COMPACT: 'nothing_to_compact',
  EMPTY_RESPONSE: 'empty_response',
  INSUFFICIENT_REDUCTION: 'insufficient_reduction',
  SAMPLER_ERROR: 'sampler_error',
} as const;

export type CompactionFailureCode = (typeof COMPACTION_FAILURES)[keyof typeof COMPACTION_FAILURES];

export interface CompactionTrigger {
  lastPromptTokens: number;
  contextWindow: number;
  /** `lastPromptTokens / contextWindow`, floored and clamped to 100. */
  percent: number;
  step: number;
  threshold: number;
  /** Tokens to shed for the result to land at the target. */
  target: number;
}

/**
 * The pure trigger decision. Returns a trigger, or null.
 *
 * Deliberately does not consult a feature flag or a kill switch - those belong
 * to the caller, and keeping them out means this is testable without global
 * state.
 *
 * The comparison is `>` and not `>=`: a window sitting exactly on the threshold
 * does not fire. "Exactly at the line" is the case every off-by-one lands on,
 * so it is pinned by a test.
 */
export function shouldCompact(
  policy: CompactionPolicy,
  usage: { lastPromptTokens: number; contextWindow: number; currentStep?: number },
): CompactionTrigger | null {
  if (!policy.enabled) return null;
  const { lastPromptTokens, contextWindow } = usage;
  const currentStep = usage.currentStep ?? 0;
  if (!(contextWindow > 0)) return null;

  // `full-replace` is exempt from the step gate: the first prompt can already be
  // enormous once the system prompt carries the listening stats and the page
  // context, and refusing to compact it is exactly when it is most needed.
  if (policy.mode !== 'full-replace' && currentStep < policy.minStepsBeforeCompact) return null;

  const threshold = Math.floor((contextWindow * policy.triggerThresholdPercent) / 100);
  if (lastPromptTokens <= threshold) return null;

  return {
    lastPromptTokens,
    contextWindow,
    percent: Math.min(100, Math.floor((lastPromptTokens * 100) / contextWindow)),
    step: currentStep,
    threshold,
    target: Math.floor((contextWindow * policy.targetThresholdPercent) / 100),
  };
}

/**
 * Splits a transcript into what gets summarised and what stays verbatim.
 *
 * The system prompt is never summarised: it carries the instructions, and
 * rewriting instructions with a model is how a session quietly changes its own
 * rules. The most recent exchange is kept too - it is what the model is
 * actively working on, and a summary of it would lose the exact tool output the
 * next round depends on.
 */
export function splitForCompaction<T extends CountableMessage>(
  messages: readonly T[] | null | undefined,
  keepRecent = 4,
): { system: T[]; compact: T[]; keep: T[] } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { system: [], compact: [], keep: [] };
  }

  const system = messages.filter((message) => message?.role === 'system');
  const rest = messages.filter((message) => message?.role !== 'system');

  // Never keep everything: an empty compaction region would spin.
  const keepCount = Math.min(Math.max(0, keepRecent), Math.max(0, rest.length - 1));
  const cut = rest.length - keepCount;

  return { system, compact: rest.slice(0, cut), keep: rest.slice(cut) };
}

/**
 * Whether a summary actually bought anything.
 *
 * Returns null when it did, or the failure when it did not. The token counts
 * ride along so the log says by how much it fell short.
 */
export function verifyReduction(
  tokensBefore: number,
  tokensAfter: number,
  minRatio = DEFAULT_MIN_REDUCTION_RATIO,
): { code: CompactionFailureCode; tokensBefore: number; tokensAfter: number; saved: number } | null {
  if (!(tokensBefore > 0)) return null;
  // Zero tokens is a 100% saving and would pass a naive ratio check, so it needs
  // its own code rather than being read as a triumph.
  if (!(tokensAfter > 0)) {
    return {
      code: COMPACTION_FAILURES.EMPTY_RESPONSE,
      tokensBefore,
      tokensAfter: 0,
      saved: 1,
    };
  }
  const saved = (tokensBefore - tokensAfter) / tokensBefore;
  if (saved < minRatio) {
    return { code: COMPACTION_FAILURES.INSUFFICIENT_REDUCTION, tokensBefore, tokensAfter, saved };
  }
  return null;
}

/**
 * The summarisation instruction.
 *
 * A checklist rather than "summarise this", because a vague instruction
 * produces a vague summary, and a vague summary loses the track ids and the
 * user's stated intent that the rest of the turn runs on. The last line is the
 * one that matters: the summary replaces the transcript, so anything it omits
 * is gone for good.
 */
export const SUMMARY_INSTRUCTION = [
  '把上面的对话压缩成一段摘要，使得仅凭摘要就能继续工作。',
  '按顺序保留：',
  '1. 用户想要什么，尽量用用户自己的说法。',
  '2. 已经做出的决定和理由 —— 不只是结论。',
  '3. 已经确定的歌曲 id、歌单名、页面路径等具体标识。',
  '4. 已完成什么、还差什么。',
  '5. 试过但失败的做法，避免重复尝试。',
  '省略寒暄和重复表述。要具体，宁可给名字也不要给描述。',
  '这段对话将被摘要替换，你省略的内容会永久丢失。',
].join('\n');

export function buildCompactionRequest<T extends CountableMessage>(messages: readonly T[]): T[] {
  return [
    ...messages,
    { role: 'user', content: SUMMARY_INSTRUCTION } as T,
  ];
}

/**
 * Applies a summary, replacing the compacted region.
 *
 * The summary is inserted as a `user` message rather than a `system` one on
 * purpose: a system message could outrank the instructions the app configured,
 * and a model-authored text should never be able to do that.
 */
export function applyCompaction<T extends CountableMessage>(
  messages: readonly T[],
  summary: string,
  keepRecent = 4,
): T[] {
  const { system, keep } = splitForCompaction(messages, keepRecent);
  return [
    ...system,
    { role: 'user', content: '[以下是之前对话的摘要]\n' + summary } as T,
    ...keep,
  ];
}

/** One line describing what a compaction did, for the activity strip. */
export function describeCompaction(result: {
  tokensBefore: number;
  tokensAfter: number;
  turnsCompacted: number;
}): string {
  const before = formatTokens(result.tokensBefore) ?? String(result.tokensBefore);
  const after = formatTokens(result.tokensAfter) ?? String(result.tokensAfter);
  const pct =
    result.tokensBefore > 0
      ? Math.round(((result.tokensBefore - result.tokensAfter) / result.tokensBefore) * 100)
      : 0;
  return `已压缩 ${result.turnsCompacted} 轮对话：${before} → ${after}（-${pct}%）`;
}

export function transcriptTokens(messages: readonly CountableMessage[] | null | undefined): number {
  return estimateTranscriptTokens(messages);
}
