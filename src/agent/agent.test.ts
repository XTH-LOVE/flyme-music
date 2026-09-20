import { describe, expect, it } from 'vitest';
import {
  BYTES_PER_TOKEN,
  IMAGE_TOKEN_ESTIMATE,
  estimateChars,
  estimateImageTokens,
  estimateTokens,
  estimateTranscriptTokens,
  exceedsThreshold,
  exceedsThresholdWithHeadroom,
  formatTokens,
  freeTokens,
  usagePercentForDisplay,
  usagePercentForGate,
  usagePercentage,
} from './tokens';
import {
  COMPACTION_FAILURES,
  applyCompaction,
  buildCompactionRequest,
  defaultCompactionPolicy,
  describeCompaction,
  shouldCompact,
  splitForCompaction,
  verifyReduction,
  SUMMARY_INSTRUCTION,
} from './compaction';

describe('estimateTokens', () => {
  it('is bytes over four', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abc')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('x'.repeat(4000))).toBe(1000);
    expect(BYTES_PER_TOKEN).toBe(4);
  });

  it('measures UTF-8 bytes, not UTF-16 units', () => {
    // The regression this guards: `.length` counts a CJK character as one, but
    // the heuristic is defined on UTF-8 bytes where it is three. Flyme's users
    // type Chinese, so `.length` would under-count by 3x exactly where the
    // budget matters.
    expect(estimateTokens('晴天')).toBe(1); // 6 bytes, floored
    expect(estimateTokens('晴天晴天晴天晴天')).toBe(6); // 24 bytes
    expect(estimateTokens('晴天晴天晴天晴天')).toBeGreaterThan(estimateTokens('abcdefgh'));
  });

  it('handles astral characters', () => {
    // An emoji is 4 UTF-8 bytes but 2 UTF-16 units.
    expect(estimateTokens('\u{1F600}')).toBe(1);
  });

  it('tolerates junk', () => {
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(42)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });
});

describe('estimateChars / estimateImageTokens', () => {
  it('inverts the estimate', () => {
    expect(estimateChars(0)).toBe(0);
    expect(estimateChars(1000)).toBe(4000);
    expect(estimateChars(-5)).toBe(0);
  });

  it('prices images at the documented constant', () => {
    expect(estimateImageTokens(0)).toBe(0);
    expect(estimateImageTokens(2)).toBe(2 * IMAGE_TOKEN_ESTIMATE);
  });
});

describe('usage percentages', () => {
  it('is null for an unknown window, not zero', () => {
    // "0% full" next to a window nobody knows is a lie, and the agent would then
    // never compact.
    expect(usagePercentage(100, 0)).toBeNull();
    expect(usagePercentage(0, 0)).toBeNull();
    expect(usagePercentForDisplay(100, 0)).toBeNull();
    expect(usagePercentForGate(100, 0)).toBeNull();
  });

  it('clamps at 100', () => {
    expect(usagePercentage(150, 100)).toBe(100);
    expect(usagePercentForDisplay(150, 100)).toBe(100);
  });

  it('treats a genuinely empty window as 0%', () => {
    expect(usagePercentage(0, 100)).toBe(0);
  });

  it('rounds for display and truncates for the gate', () => {
    expect(usagePercentForDisplay(85, 200)).toBe(43); // 42.5
    expect(usagePercentForGate(85, 200)).toBe(42); // 42.5
    expect(usagePercentForDisplay(7, 8)).toBe(88);
    expect(usagePercentForGate(7, 8)).toBe(87);
  });

  it('CONTRACT: the gate agrees with the truncated percentage everywhere', () => {
    // The invariant that keeps the UI from saying "85%" while the gate computes
    // 84% and does nothing. Checked over a grid because the two implementations
    // diverge exactly at boundaries.
    const windows = [0, 1, 50, 100, 101, 1024, 100_000, 128_001, 1_000_001];
    const percents = [0, 1, 50, 85, 99, 100];
    for (const window of windows) {
      for (const pct of percents) {
        for (const used of [0, 1, Math.floor(window / 2), window - 1, window, window + 1, window + 1000]) {
          const gate = usagePercentForGate(used, window);
          expect(exceedsThreshold(used, window, pct)).toBe(gate !== null && gate >= pct);
        }
      }
    }
  });
});

describe('threshold gates', () => {
  it('fires on the boundary, not one past it', () => {
    expect(exceedsThreshold(850, 1000, 85)).toBe(true);
    expect(exceedsThreshold(849, 1000, 85)).toBe(false);
    expect(exceedsThreshold(950, 1000, 95)).toBe(true);
    expect(exceedsThreshold(949, 1000, 95)).toBe(false);
  });

  it('treats an unknown window as never over', () => {
    expect(exceedsThreshold(50, 0, 85)).toBe(false);
  });

  it('PROPERTY: zero headroom matches the plain gate across the grid', () => {
    const windows = [0, 1, 50, 100, 101, 1024, 100_000, 128_001, 1_000_001];
    const percents = [0, 1, 50, 85, 99, 100];
    for (const window of windows) {
      for (const pct of percents) {
        for (const used of [0, 1, Math.floor(window / 2), window - 1, window, window + 1, window + 1000]) {
          expect(exceedsThresholdWithHeadroom(used, window, pct, 0)).toBe(exceedsThreshold(used, window, pct));
        }
      }
    }
  });

  it('headroom moves the gate earlier by exactly that many tokens', () => {
    expect(exceedsThresholdWithHeadroom(80_999, 100_000, 85, 4_000)).toBe(false);
    expect(exceedsThresholdWithHeadroom(81_000, 100_000, 85, 4_000)).toBe(true);
  });

  it('a headroom larger than the threshold saturates', () => {
    expect(exceedsThresholdWithHeadroom(0, 100_000, 85, 1_000_000)).toBe(true);
  });

  it('freeTokens saturates at zero', () => {
    expect(freeTokens(100, 30)).toBe(70);
    expect(freeTokens(100, 200)).toBe(0);
  });
});

describe('transcript estimation', () => {
  it('counts per-message overhead, or a long chat under-estimates', () => {
    expect(estimateTranscriptTokens([{ role: 'user', content: 'abcd' }])).toBe(5);
    const many = Array.from({ length: 100 }, () => ({ role: 'user', content: 'abcd' }));
    expect(estimateTranscriptTokens(many)).toBeGreaterThan(300);
  });

  it('tolerates junk', () => {
    expect(estimateTranscriptTokens(null)).toBe(0);
    expect(estimateTranscriptTokens([null as never, 42 as never])).toBe(0);
  });
});

describe('formatTokens', () => {
  it('scales and refuses nonsense', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(48_200)).toBe('48k');
    expect(formatTokens(1_200_000)).toBe('1.20M');
    expect(formatTokens(-1)).toBeNull();
    expect(formatTokens(Number.NaN)).toBeNull();
  });
});

describe('shouldCompact', () => {
  const policy = (over = {}) => defaultCompactionPolicy(over);

  it('defaults to 85 down to 50', () => {
    const p = policy();
    expect(p.triggerThresholdPercent).toBe(85);
    expect(p.targetThresholdPercent).toBe(50);
    expect(p.enabled).toBe(true);
  });

  it('is silent when disabled', () => {
    // The regression that mattered in the standalone version: a second gate
    // meant `enabled: false` only switched one of them off.
    expect(shouldCompact(policy({ enabled: false }), { lastPromptTokens: 90_000, contextWindow: 100_000 })).toBeNull();
  });

  it('is silent without a window', () => {
    expect(shouldCompact(policy(), { lastPromptTokens: 1000, contextWindow: 0 })).toBeNull();
  });

  it('does not fire exactly on the line', () => {
    expect(shouldCompact(policy(), { lastPromptTokens: 85_000, contextWindow: 100_000 })).toBeNull();
    expect(shouldCompact(policy(), { lastPromptTokens: 85_001, contextWindow: 100_000 })).not.toBeNull();
  });

  it('reports the numbers a caller needs, including a target below the trigger', () => {
    const trigger = shouldCompact(policy(), { lastPromptTokens: 90_000, contextWindow: 100_000, currentStep: 10 });
    expect(trigger?.percent).toBe(90);
    expect(trigger?.threshold).toBe(85_000);
    expect(trigger?.target).toBe(50_000);
    expect(trigger!.target).toBeLessThan(trigger!.threshold);
  });

  it('clamps the reported percent at 100', () => {
    expect(shouldCompact(policy(), { lastPromptTokens: 200_000, contextWindow: 100_000 })?.percent).toBe(100);
  });

  it('full-replace ignores the step gate', () => {
    const p = policy({ minStepsBeforeCompact: 3 });
    expect(shouldCompact(p, { lastPromptTokens: 90_000, contextWindow: 100_000, currentStep: 0 })).not.toBeNull();
  });

  it('partial modes enforce the step gate', () => {
    const p = policy({ mode: 'steps-only', minStepsBeforeCompact: 3 });
    expect(shouldCompact(p, { lastPromptTokens: 90_000, contextWindow: 100_000, currentStep: 2 })).toBeNull();
    expect(shouldCompact(p, { lastPromptTokens: 90_000, contextWindow: 100_000, currentStep: 3 })).not.toBeNull();
  });
});

describe('splitForCompaction', () => {
  const messages = [
    { role: 'system', content: 'instructions' },
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'b' },
    { role: 'user', content: 'c' },
    { role: 'assistant', content: 'd' },
    { role: 'user', content: 'e' },
  ];

  it('never summarises the system prompt', () => {
    // Rewriting the instructions with a model is how a session changes its own
    // rules without anyone deciding to.
    const { system, compact } = splitForCompaction(messages, 2);
    expect(system).toHaveLength(1);
    expect(compact.every((m) => m.role !== 'system')).toBe(true);
  });

  it('keeps the most recent exchange verbatim', () => {
    const { keep } = splitForCompaction(messages, 2);
    expect(keep.map((m) => m.content)).toEqual(['d', 'e']);
  });

  it('always leaves something to summarise', () => {
    const { compact } = splitForCompaction(messages, 99);
    expect(compact.length).toBeGreaterThanOrEqual(1);
  });

  it('survives an empty transcript', () => {
    expect(splitForCompaction([])).toEqual({ system: [], compact: [], keep: [] });
    expect(splitForCompaction(null)).toEqual({ system: [], compact: [], keep: [] });
  });
});

describe('verifyReduction', () => {
  it('accepts a real saving', () => {
    expect(verifyReduction(100_000, 20_000)).toBeNull();
  });

  it('rejects a summary that bought nothing', () => {
    const failure = verifyReduction(100_000, 95_000);
    expect(failure?.code).toBe(COMPACTION_FAILURES.INSUFFICIENT_REDUCTION);
    expect(failure?.saved).toBeCloseTo(0.05, 5);
  });

  it('rejects an empty summary rather than reading it as a 100% saving', () => {
    expect(verifyReduction(100_000, 0)?.code).toBe(COMPACTION_FAILURES.EMPTY_RESPONSE);
  });

  it('is a no-op when there was nothing to compact', () => {
    expect(verifyReduction(0, 0)).toBeNull();
  });
});

describe('applyCompaction', () => {
  it('keeps the system prompt first and the summary in a user message', () => {
    const messages = [
      { role: 'system', content: 'instructions' },
      { role: 'user', content: 'old' },
      { role: 'assistant', content: 'older' },
      { role: 'user', content: 'newest' },
    ];
    const result = applyCompaction(messages, 'the summary', 1);
    expect(result[0].role).toBe('system');
    expect(result[1].role).toBe('user');
    expect(result[1].content).toContain('the summary');
    expect(result[result.length - 1].content).toBe('newest');
  });

  it('actually shrinks the transcript', () => {
    const messages = [
      { role: 'system', content: 'instructions' },
      ...Array.from({ length: 40 }, (_, i) => ({ role: 'user', content: 'message ' + i + ' '.repeat(50) })),
    ];
    const before = estimateTranscriptTokens(messages);
    const after = estimateTranscriptTokens(applyCompaction(messages, 'short', 2));
    expect(after).toBeLessThan(before / 2);
  });
});

describe('summary instruction', () => {
  it('asks for what a session needs in order to continue', () => {
    for (const needle of ['歌曲 id', '已完成', '失败', '摘要替换']) {
      expect(SUMMARY_INSTRUCTION).toContain(needle);
    }
  });

  it('is appended without mutating the caller\'s transcript', () => {
    const messages = [{ role: 'user', content: 'hi' }];
    expect(buildCompactionRequest(messages)).toHaveLength(2);
    expect(messages).toHaveLength(1);
  });
});

describe('describeCompaction', () => {
  it('reports the saving', () => {
    const line = describeCompaction({ tokensBefore: 100_000, tokensAfter: 20_000, turnsCompacted: 12 });
    expect(line).toContain('12');
    expect(line).toContain('100k');
    expect(line).toContain('20k');
    expect(line).toContain('-80%');
  });
});
