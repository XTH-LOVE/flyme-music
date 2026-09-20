/**
 * Sleep-timer volume fade helpers (pure, unit-testable).
 *
 * The sleep timer fades the volume down over a short window before it stops
 * playback, so the music "drifts off" instead of cutting out. Everything here
 * is a pure function of (now, deadline, fadeSeconds, fromVolume) so it can be
 * verified without touching the real audio element.
 */

/** How many seconds before the deadline the fade begins. */
export const SLEEP_FADE_SECONDS = 30;

export interface SleepFadeState {
  /** Volume the player had when the fade was armed (restored when stopped). */
  fromVolume: number;
  /** Deadline timestamp (ms) after which playback pauses. */
  endsAt: number;
}

/**
 * Compute the current volume for a sleep fade.
 * Returns null while no fade is active or before it starts; otherwise a
 * value in [0, 1] that walks from `fromVolume` down to 0 across the window.
 */
export function sleepFadeVolume(
  now: number,
  endsAt: number,
  fromVolume: number,
  fadeSeconds = SLEEP_FADE_SECONDS,
): number | null {
  const fadeStart = endsAt - fadeSeconds * 1000;
  if (now < fadeStart) return null;
  if (now >= endsAt) return 0;
  const progress = (now - fadeStart) / (fadeSeconds * 1000); // 0..1
  const t = Math.min(1, Math.max(0, progress));
  // Ease-out so the drop is gentle at first and quickest right before the end.
  const eased = 1 - (1 - t) * (1 - t);
  return Math.max(0, fromVolume * (1 - eased));
}
