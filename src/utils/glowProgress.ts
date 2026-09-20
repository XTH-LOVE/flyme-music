/**
 * Geometry for the "Super Island" glow progress bar, ported from Halcyon's
 * `SuperIslandGlowProgressBar`.
 *
 * Two details are worth having and both are pure arithmetic, so they live here
 * rather than in the component:
 *
 *  - the fill stops shrinking once it is as wide as it is tall, so a barely
 *    started track reads as a dot instead of a sliver;
 *  - the comet sprite fades in over the first few percent, because it is
 *    centred on the fill's leading edge and would otherwise hang half off the
 *    start of the track.
 */

/** Smallest the fill may get: a circle the height of the track. */
export const GLOW_MIN_SIZE = 6;

/** Fraction of the track over which the comet fades in. */
export const GLOW_HEAD_FADE = 0.04;

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/**
 * The fill's width, as the CSS expression for Halcyon's
 * `mix(minSize, trackWidth, progress)`.
 *
 * Written as a `calc()` rather than resolved in JS because `100%` already *is*
 * the track width, so the browser computes it without us measuring the bar or
 * re-measuring it on every resize.
 */
export function glowFillWidth(progress: number, minSize: number = GLOW_MIN_SIZE): string {
  return 'calc(' + minSize + 'px + (100% - ' + minSize + 'px) * ' + clamp01(progress).toFixed(4) + ')';
}

/**
 * Opacity of the comet sprite.
 *
 * At zero progress the sprite is centred on the very start of the track, so
 * half of it would sit outside the bar. Fading it in over the first few percent
 * hides that without leaving the head invisible while a track is loading.
 */
export function glowHeadOpacity(progress: number, fade: number = GLOW_HEAD_FADE): number {
  const p = clamp01(progress);
  // A non-positive fade means "never fade" rather than "divide by zero".
  if (!(fade > 0)) return 1;
  return Math.min(1, p / fade);
}
