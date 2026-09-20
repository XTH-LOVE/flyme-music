/**
 * Material 3 Expressive shapes, ported from Halcyon's ExpressiveShapes.kt.
 *
 * Halcyon builds these with androidx `RoundedPolygon`; the web equivalent is a
 * rounded-polygon path generator, which is all those shapes really are — a
 * polygon whose corners have been pulled in along each edge and joined with a
 * quadratic curve through the original vertex.
 *
 * All paths are laid out in a 100x100 box so a caller can scale them with a
 * single `viewBox` change.
 */

interface Point {
  x: number;
  y: number;
}

const SIZE = 100;
const CENTRE = SIZE / 2;
/** Leaves a small margin so strokes and shadows are not clipped. */
const RADIUS = SIZE * 0.46;

/** Alternating outer/inner vertices — the `star()` primitive Halcyon uses. */
function starPoints(vertices: number, innerRadius: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < vertices * 2; i += 1) {
    // -90° so the first vertex points up, matching Compose's origin.
    const angle = (i * Math.PI) / vertices - Math.PI / 2;
    const radius = (i % 2 === 0 ? 1 : innerRadius) * RADIUS;
    points.push({ x: CENTRE + Math.cos(angle) * radius, y: CENTRE + Math.sin(angle) * radius });
  }
  return points;
}

function regularPoints(vertices: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < vertices; i += 1) {
    const angle = (i * 2 * Math.PI) / vertices - Math.PI / 2;
    points.push({ x: CENTRE + Math.cos(angle) * RADIUS, y: CENTRE + Math.sin(angle) * RADIUS });
  }
  return points;
}

/** Walk from `a` toward `b` by `fraction` of the edge. */
function towards(a: Point, b: Point, fraction: number): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return a;
  return { x: a.x + dx * fraction, y: a.y + dy * fraction };
}

/**
 * Replaces every corner with a quadratic curve, cutting `rounding / 2` of the
 * shorter adjacent edge on each side. `rounding` 0 keeps sharp corners; 1 turns
 * the shape into a near-blob.
 */
function roundCorners(points: Point[], rounding: number): string {
  const count = points.length;
  const segments: string[] = [];
  const f = (n: number) => n.toFixed(2);

  for (let i = 0; i < count; i += 1) {
    const previous = points[(i - 1 + count) % count];
    const current = points[i];
    const next = points[(i + 1) % count];
    const entry = towards(current, previous, rounding * 0.5);
    const exit = towards(current, next, rounding * 0.5);
    segments.push(
      `L ${f(entry.x)} ${f(entry.y)}` +
        ` Q ${f(current.x)} ${f(current.y)} ${f(exit.x)} ${f(exit.y)}`,
    );
  }

  // The first segment has no preceding point to draw a line from, so it is
  // rewritten as a move to keep the subpath anchored.
  segments[0] = segments[0].replace(/^L/, 'M');
  return segments.join(' ') + ' Z';
}

/** Softly scalloped circle — 8 shallow points. */
export const COOKIE_PATH = roundCorners(starPoints(8, 0.86), 0.5);
/** Four-petal clover. */
export const CLOVER_PATH = roundCorners(starPoints(4, 0.52), 0.34);
/** Seven-sided pebble. */
export const PEBBLE_PATH = roundCorners(regularPoints(7), 0.5);

export type ExpressiveShapeName = 'cookie' | 'clover' | 'pebble';

const PATHS: Record<ExpressiveShapeName, string> = {
  cookie: COOKIE_PATH,
  clover: CLOVER_PATH,
  pebble: PEBBLE_PATH,
};

export function shapePath(shape: ExpressiveShapeName): string {
  return PATHS[shape];
}
