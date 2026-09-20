/**
 * Geometry for the "locate the playing song" button, ported from Halcyon's
 * `LocateCurrentSongFloatingButton`.
 *
 * Halcyon shows the button only once the nearest visible row is more than two
 * away from the playing one: a shortcut for a row that is a single nudge
 * off-screen is noise. Everything here is pure so the thresholds can be tested
 * without a DOM.
 */

/** Rows of slack before the button appears. */
export const NEAR_ROWS = 2;

export interface Rect {
  top: number;
  bottom: number;
}

/**
 * The vertical band of `container` that is actually on screen.
 *
 * Clamping to the viewport is what makes this work for both a window-scrolled
 * page and a page that scrolls inside its own container: in the first case the
 * band is simply the viewport, in the second it is the part of the container
 * the user can see.
 */
export function visibleBand(container: Rect, viewportHeight: number): Rect {
  return {
    top: Math.max(container.top, 0),
    bottom: Math.min(container.bottom, viewportHeight),
  };
}

/**
 * Whether the playing row is far enough outside the visible band to warrant a
 * button. `rowHeight` scales the slack, so the rule reads as "two rows away"
 * no matter how tall a row happens to be.
 */
export function needsLocating(
  row: Rect,
  band: Rect,
  rowHeight: number,
  nearRows: number = NEAR_ROWS,
): boolean {
  const slack = Math.max(rowHeight, 0) * Math.max(nearRows, 0);
  return row.bottom < band.top - slack || row.top > band.bottom + slack;
}

/**
 * Selector for the row rendered at `index`.
 *
 * The attribute is written by `TrackListItem`, so centralising it here keeps
 * the list and everything that scrolls the list in step.
 */
export function rowSelector(index: number): string {
  return '[data-row-index="' + index + '"]';
}

/**
 * Stable identity of a row, matching how the player identifies a track. Used to
 * find the playing row inside a list that may render a different row type.
 */
export function trackKey(track: { id: string; source: string }): string {
  return track.source + ':' + track.id;
}
