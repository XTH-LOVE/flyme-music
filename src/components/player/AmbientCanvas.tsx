import { useEffect, useMemo, useRef } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import {
  ambientConfigFromPalette,
  renderAmbientField,
  type AmbientConfig,
} from '@/utils/ambientField';

/**
 * Raster width of the field's backing store.
 *
 * The blobs span ~0.7 of the frame and the Perlin runs at 1.5 cycles, so the
 * finest detail covers tens of source pixels. CSS scales this up with smooth
 * interpolation, which is visually lossless here — `utils/ambientField.ts` has
 * the full reasoning.
 */
const FIELD_WIDTH = 144;
const FIELD_MIN_HEIGHT = 64;
const FIELD_MAX_HEIGHT = 224;

/**
 * The drift is glacial, so a low repaint rate is invisible — and it is the
 * difference between a background that costs nothing and one that eats a
 * mobile CPU, because every frame is a full CPU rasterisation.
 */
const FRAME_MS = 1000 / 12;

/** Blob travel per unit time, relative to Halcyon's shader clock. */
const DRIFT_RATE = 0.32;

/** Time constant of the colour crossfade when the track (and palette) changes. */
const FADE_TAU = 260;

/** Deep copy: the loop eases a live config in place, so it must not alias. */
function cloneConfig(config: AmbientConfig): AmbientConfig {
  return {
    ...config,
    points: config.points.map((point) => ({
      ...point,
      color: [...point.color] as [number, number, number, number],
    })),
  };
}

/**
 * Eases a live config toward its target. Configs derived from a cover palette
 * share their blob positions, so in practice only colour and shaping move.
 */
function easeInto(current: AmbientConfig, target: AmbientConfig, k: number): void {
  const shared = Math.min(current.points.length, target.points.length);
  for (let i = 0; i < shared; i += 1) {
    const from = current.points[i].color;
    const to = target.points[i].color;
    for (let c = 0; c < 4; c += 1) from[c] += (to[c] - from[c]) * k;
  }
  current.drift += (target.drift - current.drift) * k;
  current.noiseScale += (target.noiseScale - current.noiseScale) * k;
  current.desaturate += (target.desaturate - current.desaturate) * k;
  current.lighten += (target.lighten - current.lighten) * k;
}

export interface AmbientCanvasProps {
  /** Two-tone cover palette the field is derived from. */
  palette: [string, string];
  /**
   * Whether the field should drift. When false it freezes on its last frame —
   * a moving wash behind a paused player reads as a bug, not a flourish.
   */
  live: boolean;
}

/**
 * The OS3 ambient colour field: a slow wash of palette-derived blobs, drifting
 * and modulated by Perlin noise, ported from Halcyon's background shader.
 *
 * Rendered on the CPU into a small backing store that CSS scales up, then
 * blended over the artwork layers beneath it. Frozen rather than unmounted
 * when motion is off, so a still backdrop still gets the colour.
 */
export function AmbientCanvas({ palette, live }: AmbientCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDark = useThemeStore((s) => s.resolved) === 'dark';

  // Keyed on the colours themselves rather than the array identity: callers
  // hand us a fresh tuple often enough that identity would churn the config.
  const [first, second] = palette;
  const config = useMemo(
    () => ambientConfigFromPalette([first, second], isDark),
    [first, second, isDark],
  );

  /** Read from inside the animation loop so the loop never has to restart. */
  const targetRef = useRef(config);
  const liveRef = useRef(live);
  /** Repaints the frozen frame on demand; installed by the effect below. */
  const redrawRef = useRef<((dt: number) => void) | null>(null);

  useEffect(() => {
    targetRef.current = config;
    liveRef.current = live;
    // Nothing repaints while frozen, so a palette or theme change has to be
    // pushed through by hand or the still frame keeps the old colours. An
    // infinite step lands the ease in a single frame.
    if (!live) redrawRef.current?.(Number.POSITIVE_INFINITY);
  }, [config, live]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let image: ImageData | null = null;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const aspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1;
      height = Math.round(
        Math.min(FIELD_MAX_HEIGHT, Math.max(FIELD_MIN_HEIGHT, FIELD_WIDTH / aspect)),
      );
      width = FIELD_WIDTH;
      canvas.width = width;
      canvas.height = height;
      image = ctx.createImageData(width, height);
    };

    // The live field is eased toward the target so a track change reads as a
    // wash rather than a jump. A step of 0 holds it, infinity snaps it.
    const current = cloneConfig(targetRef.current);
    let clock = 0;

    const draw = (dt: number) => {
      if (!image) return;
      easeInto(current, targetRef.current, dt <= 0 ? 0 : 1 - Math.exp(-dt / FADE_TAU));
      renderAmbientField(image.data, width, height, clock, current);
      ctx.putImageData(image, 0, 0);
    };

    redrawRef.current = draw;

    resize();
    draw(0);

    // A resize clears the canvas, so repaint without advancing the ease.
    const observer = new ResizeObserver(() => {
      resize();
      draw(0);
    });
    observer.observe(canvas);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let previous = 0;
    let pending = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const delta = previous === 0 ? 0 : now - previous;
      previous = now;
      // `previous` advances even while skipping, so resuming after a pause
      // continues the drift from where it stopped instead of teleporting.
      if (!liveRef.current || document.hidden || reduced.matches) {
        pending = 0;
        return;
      }
      // Advance by real elapsed time: the drift keeps a constant speed however
      // often we actually repaint.
      clock += delta * 0.001 * DRIFT_RATE;
      pending += delta;
      if (pending < FRAME_MS) return;
      pending = 0;
      draw(delta);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      redrawRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} className="hc-bg__field" aria-hidden="true" />;
}
