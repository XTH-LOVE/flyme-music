/**
 * Fling detection for the drag-down dismiss.
 *
 * A distance threshold alone makes the gesture feel heavy: on a tall phone the
 * user has to drag a long way before the player closes, even when the flick was
 * plainly deliberate. Measuring the trailing velocity lets a short, fast flick
 * close too — the same rule platform bottom sheets use.
 */

/** Samples older than this are dropped; a stale start would flatten the speed. */
export const VELOCITY_WINDOW_MS = 120;

export interface DragSample {
  /** Event timestamp, in milliseconds. */
  t: number;
  /** Pointer Y, in pixels. */
  y: number;
}

/**
 * Downward speed in px/s across the sample window, or 0 when it cannot be
 * measured. Returning 0 rather than NaN matters: the caller compares it against
 * a threshold, and NaN would silently fail every comparison.
 */
export function flingVelocity(samples: readonly DragSample[]): number {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsed = last.t - first.t;
  if (elapsed <= 0) return 0;
  return ((last.y - first.y) / elapsed) * 1000;
}

/**
 * Drops samples that fell out of the trailing window, keeping at least one so
 * the next sample always has a baseline to measure against.
 */
export function trimSamples(samples: DragSample[], now: number): DragSample[] {
  while (samples.length > 1 && now - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();
  return samples;
}
