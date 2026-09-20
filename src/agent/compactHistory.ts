/**
 * The app-specific half of compaction: deciding when the agent's history is
 * too big, asking the model to summarise it, and swapping it in.
 *
 * The pure decision logic lives in `./compaction`; this file is only the glue,
 * and it is written so that every failure path returns the *original* history.
 * A session that cannot compact is a session that will eventually overflow -
 * which is where it already was - and that is strictly better than a turn that
 * dies because its summary did.
 */

import { chatOnce, type AiChatMessage, type AiConfig } from '@/ai/aiClient';
import {
  COMPACTION_FAILURES,
  applyCompaction,
  buildCompactionRequest,
  defaultCompactionPolicy,
  describeCompaction,
  shouldCompact,
  verifyReduction,
  type CompactionFailureCode,
  type CompactionPolicy,
} from './compaction';
import { estimateTranscriptTokens, usagePercentForDisplay } from './tokens';

/**
 * Window the gate measures against.
 *
 * Deliberately conservative. Flyme lets the user point at any OpenAI-compatible
 * endpoint, and the local models people run offline have 8k-32k windows; a
 * default that assumed 128k would let the transcript grow past what a local
 * model can accept, which is the exact case this is here to prevent.
 */
export const DEFAULT_CONTEXT_WINDOW = 16_384;

/**
 * The window to gate against.
 *
 * Overridable through `localStorage` rather than only through the settings page,
 * because the right value depends entirely on which endpoint the user pointed
 * at - a 128k hosted model should not be compacted as if it were an 8k local
 * one. There is no settings row for it yet; this is the hook a future one
 * would write to.
 */
export function resolveContextWindow(): number {
  try {
    const saved = Number(localStorage.getItem('aurora.agent.contextWindow'));
    if (Number.isFinite(saved) && saved >= 1024) return Math.floor(saved);
  } catch {
    /* private mode - fall through to the default */
  }
  return DEFAULT_CONTEXT_WINDOW;
}

export type CompactionSkipReason = CompactionFailureCode | 'disabled' | 'below-threshold' | 'nothing-to-compact';

export interface CompactionOutcome {
  compacted: boolean;
  reason?: CompactionSkipReason;
  tokensBefore: number;
  tokensAfter: number;
  /** The history to continue with - the original array when nothing happened. */
  history: AiChatMessage[];
  /** A one-line note for the activity strip, when something happened. */
  note?: string;
}

export interface MaybeCompactOptions {
  contextWindow?: number;
  policy?: CompactionPolicy;
  /** Round index, used by the step gate on partial modes. */
  step?: number;
  signal?: AbortSignal;
  onNote?: (note: string) => void;
}

/**
 * Compacts `history` in place if it is over the line. Never throws.
 *
 * Called before a model request rather than after one: the number that matters
 * is the size of the prompt about to go out, and checking afterwards means the
 * request that overflowed has already been sent.
 */
export async function maybeCompactHistory(
  cfg: AiConfig,
  history: AiChatMessage[],
  options: MaybeCompactOptions = {},
): Promise<CompactionOutcome> {
  const policy = options.policy ?? defaultCompactionPolicy();
  const contextWindow = options.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const tokensBefore = estimateTranscriptTokens(history);

  const unchanged = (reason: CompactionSkipReason): CompactionOutcome => ({
    compacted: false,
    reason,
    tokensBefore,
    tokensAfter: tokensBefore,
    history,
  });

  if (!policy.enabled) return unchanged('disabled');

  const trigger = shouldCompact(policy, {
    lastPromptTokens: tokensBefore,
    contextWindow,
    currentStep: options.step ?? 0,
  });
  if (!trigger) return unchanged('below-threshold');

  // Nothing to summarise: the whole transcript is the system prompt plus the
  // few messages we would keep anyway.
  if (history.filter((message) => message.role !== 'system').length <= policy.keepRecent + 1) {
    return unchanged('nothing-to-compact');
  }

  try {
    const summary = (
      await chatOnce(cfg, buildCompactionRequest(history), options.signal, {
        // Long enough for a real summary, short enough that a model which
        // decides to write an essay cannot eat the budget it was asked to save.
        maxTokens: 700,
        temperature: 0.3,
      })
    ).trim();

    if (!summary) return unchanged(COMPACTION_FAILURES.EMPTY_RESPONSE);

    const candidate = applyCompaction(history, summary, policy.keepRecent);
    const tokensAfter = estimateTranscriptTokens(candidate);
    const failure = verifyReduction(tokensBefore, tokensAfter, policy.minReductionRatio);
    if (failure) return unchanged(failure.code);

    const outcome: CompactionOutcome = {
      compacted: true,
      tokensBefore,
      tokensAfter,
      history: candidate,
      note: describeCompaction({
        tokensBefore,
        tokensAfter,
        turnsCompacted: history.length - candidate.length + 1,
      }),
    };
    if (outcome.note) options.onNote?.(outcome.note);
    return outcome;
  } catch {
    // A model error, an abort, a provider that rejects the request - all the
    // same answer: carry on with what we have.
    return unchanged(COMPACTION_FAILURES.SAMPLER_ERROR);
  }
}

/** Context usage for the UI, or null when it cannot be computed. */
export function contextUsage(
  history: readonly AiChatMessage[],
  contextWindow = DEFAULT_CONTEXT_WINDOW,
): { tokens: number; percent: number | null; window: number } {
  const tokens = estimateTranscriptTokens(history);
  return { tokens, percent: usagePercentForDisplay(tokens, contextWindow), window: contextWindow };
}
