import { describe, expect, it } from 'vitest';
import { getDownloadQueueSummary } from './downloadQueue';

describe('download queue summary', () => {
  it('exposes stable counters for diagnostics', () => {
    const summary = getDownloadQueueSummary();
    expect(summary).toHaveProperty('retryable');
    expect(summary.total).toBeGreaterThanOrEqual(0);
  });
});

