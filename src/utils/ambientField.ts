/**
 * Animated ambient colour field, ported from Halcyon's OS3 background shader
 * (`ui/effect/OS3BgFrag.kt`).
 *
 * The original is a per-pixel AGSL fragment shader. The web equivalent here is
 * a CPU rasteriser into a deliberately small buffer that the canvas scales up.
 * That is not a compromise: the field is entirely low-frequency — four soft
 * blobs plus Perlin modulation at ~1.5 cycles across the frame — so a buffer
 * around 160px wide, upscaled with smoothing, is visually indistinguishable
 * from a full-resolution pass and costs a fraction of the work.
 *
 * Everything here is pure so the maths can be tested without a canvas.
 */

/** One drifting colour blob. All coordinates are normalised to 0..1. */
export interface AmbientPoint {
  x: number;
  y: number;
  /** Radius in normalised units. */
  radius: number;
  /** Premultiplied-free RGBA, each 0..1. */
  color: [number, number, number, number];
}

export interface AmbientConfig {
  points: AmbientPoint[];
  /** How far each blob drifts from its home position, in normalised units. */
  drift: number;
  /** Perlin frequency across the frame. */
  noiseScale: number;
  /** How far the noise pushes saturation toward zero. */
  desaturate: number;
  /** How far the noise lifts brightness. */
  lighten: number;
}

const fract = (value: number) => value - Math.floor(value);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** GLSL smoothstep, including the inverted form the shader relies on. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** The shader's `hash(vec2)` — a cheap value hash, not a bitwise one. */
export function hash2(x: number, y: number): number {
  const a = fract(x * 0.13);
  const b = fract(y * 0.13);
  const c = a; // p3.z === p3.x in the original
  const shift = a * (b + 3.333) + b * (c + 3.333) + c * (a + 3.333);
  return fract((a + shift + (b + shift)) * (c + shift));
}

/** The shader's `perlin(vec2)` — bilinear value noise, not true gradient noise. */
export function perlin(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy * (1 - ux) + (d - b) * ux * uy;
}

/** The shader's `gradientNoise(vec2)` — a per-pixel dither value. */
export function gradientNoise(x: number, y: number): number {
  return fract(52.9829189 * fract(x * 0.06711056 + y * 0.00583715));
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, max === 0 ? 0 : delta / max, max];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

/**
 * Rasterises one frame into `target` as non-premultiplied RGBA bytes.
 *
 * `time` is in seconds and drives the drift; it is expected to keep increasing,
 * but the maths is periodic so wrapping it is harmless.
 */
export function renderAmbientField(
  target: Uint8ClampedArray,
  width: number,
  height: number,
  time: number,
  config: AmbientConfig,
): void {
  const { points, drift, noiseScale, desaturate, lighten } = config;

  // Blob positions depend only on time, so resolve them once per frame rather
  // than per pixel.
  const xs: number[] = [];
  const ys: number[] = [];
  for (const point of points) {
    xs.push(point.x + Math.sin(time + point.y) * drift);
    ys.push(point.y + Math.cos(time + point.x) * drift);
  }

  const spanX = width > 1 ? width - 1 : 1;
  const spanY = height > 1 ? height - 1 : 1;
  let offset = 0;

  for (let row = 0; row < height; row += 1) {
    const v = row / spanY;
    for (let col = 0; col < width; col += 1) {
      const u = col / spanX;

      const opposite = smoothstep(
        0,
        1,
        perlin(u * noiseScale - time, v * noiseScale - time),
      );

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let i = 0; i < points.length; i += 1) {
        const point = points[i];
        const dx = u - xs[i];
        const dy = v - ys[i];
        const pct = smoothstep(point.radius, 0, Math.sqrt(dx * dx + dy * dy));
        // Premultiplied mix, exactly as the shader does it, so overlapping
        // blobs composite by coverage rather than by plain colour lerp.
        r += (point.color[0] * point.color[3] - r) * pct;
        g += (point.color[1] * point.color[3] - g) * pct;
        b += (point.color[2] * point.color[3] - b) * pct;
        a += (point.color[3] - a) * pct;
      }

      if (a > 0) {
        r /= a;
        g /= a;
        b /= a;
      }

      const [hue, sat, val] = rgbToHsv(r, g, b);
      const [nr, ng, nb] = hsvToRgb(
        hue,
        sat + (0 - sat) * (opposite * desaturate),
        val + opposite * lighten,
      );

      // One LSB of dither: without it the wide, near-flat gradients band badly
      // on 8-bit displays.
      const dither = (gradientNoise(col, row) - 0.5) / 255;

      target[offset] = (nr + dither) * 255;
      target[offset + 1] = (ng + dither) * 255;
      target[offset + 2] = (nb + dither) * 255;
      target[offset + 3] = clamp01(a) * 255;
      offset += 4;
    }
  }
}

function hexToRgb01(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const int = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(int)) return [0.5, 0.5, 0.5];
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Home positions of the four blobs: one per quadrant, none centred. */
const HOMES: ReadonlyArray<readonly [number, number, number]> = [
  [0.22, 0.24, 0.74],
  [0.84, 0.18, 0.62],
  [0.14, 0.84, 0.66],
  [0.78, 0.8, 0.7],
];

/**
 * Builds a field from a cover palette. The two palette colours seed the four
 * blobs, with a lightened and a darkened variant filling the gaps so the wash
 * has depth instead of reading as two flat circles.
 */
export function ambientConfigFromPalette(
  palette: [string, string],
  isDark: boolean,
): AmbientConfig {
  const first = hexToRgb01(palette[0]);
  const second = hexToRgb01(palette[1]);
  const light = mixRgb(first, [1, 1, 1], 0.35);
  const deep = mixRgb(second, [0, 0, 0], isDark ? 0.25 : 0.4);

  const colors: Array<[number, number, number, number]> = [
    [first[0], first[1], first[2], isDark ? 0.9 : 0.78],
    [light[0], light[1], light[2], 0.6],
    [second[0], second[1], second[2], isDark ? 0.85 : 0.72],
    [deep[0], deep[1], deep[2], 0.62],
  ];

  return {
    points: HOMES.map(([x, y, radius], index) => ({ x, y, radius, color: colors[index] })),
    drift: 0.08,
    noiseScale: 1.5,
    desaturate: 0.28,
    lighten: isDark ? 0.05 : 0.09,
  };
}
