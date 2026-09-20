import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Render a long list in bounded slices instead of all at once.
 *
 * A netease playlist can carry 1000 tracks, and the row component mounts a
 * cover, an IntersectionObserver and two store subscriptions each. Mounting all
 * of them in one commit is a multi-second freeze on open, and `.song-item`'s
 * `content-visibility: auto` does not help with it - that skips painting, not
 * mounting.
 *
 * So rows are revealed in steps: a first slice, then another each time a
 * sentinel near the bottom comes into view. Everything is still reachable, just
 * not all at once. The decisions live in the pure helpers below so the caps can
 * be tested without a DOM.
 */

/** Rows rendered before any scrolling happens. */
export const INITIAL_ROWS = 60;
/** Rows added per reveal. */
export const REVEAL_STEP = 60;

/** How many rows to render up front. Never more than the list holds. */
export function initialRowCount(total: number, initial: number = INITIAL_ROWS): number {
  return Math.max(0, Math.min(initial, total));
}

/** The next budget after one reveal. Always grows, never past the end. */
export function nextRowCount(current: number, total: number, step: number = REVEAL_STEP): number {
  return Math.max(0, Math.min(current + step, total));
}

/** Whether a sentinel is still needed, i.e. some rows have not been rendered. */
export function needsSentinel(rendered: number, total: number): boolean {
  return rendered < total;
}

/**
 * Reveal ahead of the scroll so the user never reaches a visible end of list
 * while more rows exist. 800px is roughly a dozen rows of lead time.
 */
const LOOKAHEAD = '800px 0px';

/**
 * Watch a sentinel and call back when it comes into view.
 *
 * Split out from the component so the wiring that actually matters - the
 * lookahead margin, firing only on intersection, and disconnecting - is
 * testable without rendering React.
 */
export function observeSentinel(el: Element, onReveal: () => void): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onReveal();
    },
    { rootMargin: LOOKAHEAD },
  );
  observer.observe(el);
  return () => observer.disconnect();
}

interface ProgressiveListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  initial?: number;
  step?: number;
  /** Change this (e.g. the playlist id) to collapse the list back to one slice. */
  resetKey?: string | number;
}

export function ProgressiveList<T>({
  items,
  renderItem,
  initial = INITIAL_ROWS,
  step = REVEAL_STEP,
  resetKey,
}: ProgressiveListProps<T>) {
  const [count, setCount] = useState(() => initialRowCount(items.length, initial));
  const sentinel = useRef<HTMLDivElement | null>(null);

  // A different list starts collapsed again, so opening a 1000-track playlist
  // after scrolling a previous one does not mount both.
  useEffect(() => {
    setCount(initialRowCount(items.length, initial));
  }, [resetKey, initial, items.length]);

  useEffect(() => {
    if (!needsSentinel(count, items.length)) return undefined;
    const el = sentinel.current;
    // Without an observer there is no way to reveal more, so show everything
    // rather than trapping the user above an invisible wall.
    if (!el || typeof IntersectionObserver === 'undefined') {
      setCount(items.length);
      return undefined;
    }
    return observeSentinel(el, () => {
      setCount((current) => nextRowCount(current, items.length, step));
    });
  }, [count, items.length, step]);

  const rendered = Math.min(count, items.length);

  return (
    <>
      {items.slice(0, rendered).map((item, index) => renderItem(item, index))}
      {needsSentinel(rendered, items.length) ? (
        <div ref={sentinel} className="progressive-list__sentinel" aria-hidden="true" />
      ) : null}
    </>
  );
}
