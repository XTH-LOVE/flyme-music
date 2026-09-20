// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  observeSentinel,
  INITIAL_ROWS,
  REVEAL_STEP,
  initialRowCount,
  needsSentinel,
  nextRowCount,
} from './ProgressiveList';

/**
 * A 1000-track playlist used to mount 1000 rows in one commit. These helpers
 * are what keep that bounded, so the caps are worth pinning down: getting them
 * wrong either restores the freeze or hides tracks permanently.
 */
describe('initialRowCount', () => {
  it('starts with one slice', () => {
    expect(initialRowCount(1000)).toBe(INITIAL_ROWS);
  });

  it('never claims more rows than the list holds', () => {
    expect(initialRowCount(7)).toBe(7);
    expect(initialRowCount(0)).toBe(0);
  });

  it('tolerates a nonsense total', () => {
    expect(initialRowCount(-5)).toBe(0);
  });
});

describe('nextRowCount', () => {
  it('adds one step at a time', () => {
    expect(nextRowCount(INITIAL_ROWS, 1000)).toBe(INITIAL_ROWS + REVEAL_STEP);
  });

  it('stops at the end instead of overshooting', () => {
    expect(nextRowCount(980, 1000)).toBe(1000);
    expect(nextRowCount(1000, 1000)).toBe(1000);
  });

  it('always makes progress, so a reveal can never stall', () => {
    let count = initialRowCount(1000);
    const seen = new Set([count]);
    for (let i = 0; i < 100 && needsSentinel(count, 1000); i += 1) {
      const next = nextRowCount(count, 1000);
      expect(next).toBeGreaterThan(count);
      count = next;
      seen.add(count);
    }
    expect(count).toBe(1000);
  });
});

describe('needsSentinel', () => {
  it('asks for a sentinel while rows remain', () => {
    expect(needsSentinel(INITIAL_ROWS, 1000)).toBe(true);
  });

  it('drops the sentinel once everything is rendered', () => {
    expect(needsSentinel(1000, 1000)).toBe(false);
    expect(needsSentinel(0, 0)).toBe(false);
  });
});

/**
 * The wiring is what can silently break the list: if the sentinel never fires,
 * a 1000-track playlist stops at row 60 with no way to reach the rest.
 */
describe('observeSentinel', () => {
  class FakeObserver {
    static instances: FakeObserver[] = [];
    observed: Element[] = [];
    disconnected = false;
    constructor(
      private callback: IntersectionObserverCallback,
      readonly options?: IntersectionObserverInit,
    ) {
      FakeObserver.instances.push(this);
    }
    observe(el: Element) {
      this.observed.push(el);
    }
    disconnect() {
      this.disconnected = true;
    }
    emit(isIntersecting: boolean) {
      this.callback(
        [{ isIntersecting } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
  }

  beforeEach(() => {
    FakeObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
  });

  function observer(): FakeObserver {
    const created = FakeObserver.instances[0];
    if (!created) throw new Error('no observer was created');
    return created;
  }

  it('watches the sentinel with lookahead, so rows arrive before the gap', () => {
    const el = document.createElement('div');
    observeSentinel(el, () => undefined);
    expect(observer().observed).toEqual([el]);
    expect(observer().options?.rootMargin).toBe('800px 0px');
  });

  it('reveals only on intersection', () => {
    const onReveal = vi.fn();
    observeSentinel(document.createElement('div'), onReveal);
    observer().emit(false);
    expect(onReveal).not.toHaveBeenCalled();
    observer().emit(true);
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('stops observing when torn down', () => {
    const stop = observeSentinel(document.createElement('div'), () => undefined);
    stop();
    expect(observer().disconnected).toBe(true);
  });
});
