import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Icon } from '@/components/Icon';
import { usePlayerStore } from '@/store/usePlayerStore';
import { needsLocating, rowSelector, trackKey, visibleBand } from '@/utils/locatePlaying';
import type { MusicTrack } from '@/music/source/types';
import './locate-playing.css';

/** Slack used until a row has actually been laid out and can be measured. */
const ASSUMED_ROW_HEIGHT = 56;

/**
 * Index of the playing track inside `items`, or -1 when it is not in the list.
 *
 * `keyOf` is read through a ref so a page can pass an inline arrow without the
 * search re-running on every render; it is a property of the page, not of any
 * state, so it never actually changes identity in a way that matters.
 */
export function usePlayingIndex<T extends { id: string; source: string } = MusicTrack>(
  items: readonly T[],
  keyOf: (item: T) => string = trackKey,
): number {
  const current = usePlayerStore((s) => s.current);
  const keyRef = useRef(keyOf);
  keyRef.current = keyOf;
  const currentKey = current ? trackKey(current) : null;

  return useMemo(() => {
    if (currentKey === null) return -1;
    return items.findIndex((item) => keyRef.current(item) === currentKey);
  }, [items, currentKey]);
}

export interface LocatePlayingButtonProps {
  /** Element holding the rows. It is measured, not the viewport. */
  containerRef: RefObject<HTMLElement | null>;
  /** Row index of the playing track, or -1 when it is not in this list. */
  index: number;
  /**
   * Called when the row is not in the DOM yet, so a sliced list can widen its
   * slice before we try to scroll to something that does not exist.
   */
  onReveal?: (index: number) => void;
}

/**
 * Floating shortcut back to the playing row, shown only once that row is more
 * than two rows outside the visible band.
 *
 * Ported from Halcyon's `LocateCurrentSongFloatingButton`. The visibility rule
 * and the geometry live in `utils/locatePlaying.ts`; this is the wiring: watch
 * the row, and scroll to it on click.
 */
export function LocatePlayingButton({ containerRef, index, onReveal }: LocatePlayingButtonProps) {
  const [visible, setVisible] = useState(false);
  /** A token, not just the index: tapping again must scroll again. */
  const [jump, setJump] = useState<{ index: number; token: number } | null>(null);
  const token = useRef(0);

  useEffect(() => {
    const root = containerRef.current;
    if (index < 0 || !root) {
      setVisible(false);
      return undefined;
    }

    let frame = 0;
    const measure = () => {
      frame = 0;
      const row = root.querySelector(rowSelector(index));
      if (!row) {
        // Still behind a sliced list: the row cannot be on screen, and this
        // button is the only way to reach it.
        setVisible(true);
        return;
      }
      const rect = row.getBoundingClientRect();
      const band = visibleBand(root.getBoundingClientRect(), window.innerHeight);
      setVisible(needsLocating(rect, band, rect.height || ASSUMED_ROW_HEIGHT));
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    // The capture phase is deliberate: scroll events do not bubble, but they do
    // capture, so one listener here sees every scrollable ancestor in play.
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    // Rows arrive in slices and leave when the list itself changes; neither
    // fires a scroll event, so watch the container too.
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, subtree: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      mutations.disconnect();
    };
  }, [containerRef, index]);

  useEffect(() => {
    if (!jump) return;
    const row = containerRef.current?.querySelector(rowSelector(jump.index));
    if (!row) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }, [jump, containerRef]);

  const locate = useCallback(() => {
    if (index < 0) return;
    const root = containerRef.current;
    // The row has to exist before it can be scrolled to. Revealing and
    // scrolling in one batch means the scroll effect sees the widened list.
    if (root && !root.querySelector(rowSelector(index))) onReveal?.(index);
    token.current += 1;
    setJump({ index, token: token.current });
  }, [containerRef, index, onReveal]);

  return (
    <button
      type="button"
      className={'locate-playing' + (visible ? ' locate-playing--on' : '')}
      onClick={locate}
      // Kept mounted so the fade can play; hidden it is inert to pointer,
      // keyboard and screen readers alike.
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      aria-label="定位到正在播放的歌曲"
      title="定位到正在播放的歌曲"
    >
      <Icon name="locate" size={19} />
    </button>
  );
}
