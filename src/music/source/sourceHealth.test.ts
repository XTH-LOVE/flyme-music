import { describe, expect, it, vi } from 'vitest';
import { markSourceFailure, markSourceSuccess, sourceHealth, sourceInCooldown, sourcePriority } from './sourceHealth';

describe('source health', () => {
  it('moves a failing source behind a healthy source', () => {
    markSourceFailure('bilibili');
    markSourceSuccess('higequ');
    expect(sourceInCooldown('bilibili')).toBe(true);
    expect(sourcePriority(['bilibili', 'higequ'])).toEqual(['higequ', 'bilibili']);
  });

  it('does not preserve old failures forever', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    markSourceSuccess('local');
    markSourceFailure('local');
    markSourceFailure('local');
    clock.mockReturnValue(16 * 60_000 + 1_000);
    expect(sourceHealth('local').failures).toBe(1);
    clock.mockRestore();
  });
});
