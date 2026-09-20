/**
 * The in-app agent's context management.
 *
 * `src/ai` is the agent itself - its tools, its prompt, its memory. This module
 * is the part that keeps it inside a context window, ported from Grok Build's
 * token-estimation and compaction crates.
 *
 * Kept separate from `src/ai` because it is pure arithmetic with no knowledge of
 * music, tools or prompts, which is what makes it testable without a DOM.
 */

export {
  BYTES_PER_TOKEN,
  IMAGE_TOKEN_ESTIMATE,
  MESSAGE_OVERHEAD_TOKENS,
  estimateChars,
  estimateImageTokens,
  estimateMessageTokens,
  estimateTokens,
  estimateTranscriptTokens,
  exceedsThreshold,
  exceedsThresholdWithHeadroom,
  formatTokens,
  freeTokens,
  usagePercentForDisplay,
  usagePercentForGate,
  usagePercentage,
  type CountableMessage,
} from './tokens';

export {
  COMPACTION_FAILURES,
  COMPACTION_MODES,
  DEFAULT_MIN_REDUCTION_RATIO,
  DEFAULT_MIN_STEPS,
  DEFAULT_TARGET_PERCENT,
  DEFAULT_TRIGGER_PERCENT,
  SUMMARY_INSTRUCTION,
  applyCompaction,
  buildCompactionRequest,
  defaultCompactionPolicy,
  describeCompaction,
  shouldCompact,
  splitForCompaction,
  transcriptTokens,
  verifyReduction,
  type CompactionFailureCode,
  type CompactionMode,
  type CompactionPolicy,
  type CompactionTrigger,
} from './compaction';

export {
  DEFAULT_CONTEXT_WINDOW,
  contextUsage,
  maybeCompactHistory,
  resolveContextWindow,
  type CompactionOutcome,
  type CompactionSkipReason,
  type MaybeCompactOptions,
} from './compactHistory';
