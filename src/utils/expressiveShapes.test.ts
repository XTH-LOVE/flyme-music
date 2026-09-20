import { describe, expect, it } from 'vitest';
import { CLOVER_PATH, COOKIE_PATH, PEBBLE_PATH, shapePath } from './expressiveShapes';

/** Each rounded corner contributes exactly one quadratic segment. */
function cornerCount(path: string): number {
  return (path.match(/Q/g) ?? []).length;
}

/**
 * The on-curve points only. A quadratic segment is written "cx cy ex ey", and
 * the control point is the *original* polygon vertex — which the curve never
 * actually reaches — so including it would measure the unrounded shape.
 */
function onCurvePoints(path: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const command = /([MLQ])([^MLQZ]*)/g;
  let match: RegExpExecArray | null;
  while ((match = command.exec(path)) !== null) {
    const numbers = (match[2].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const offset = match[1] === 'Q' ? 2 : 0;
    points.push([numbers[offset], numbers[offset + 1]]);
  }
  return points;
}

function extent(path: string): { min: number; max: number; spread: number } {
  const values = onCurvePoints(path).flat();
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, spread: max - min };
}

describe('expressive shapes', () => {
  it('emits a closed subpath for every shape', () => {
    for (const path of [COOKIE_PATH, CLOVER_PATH, PEBBLE_PATH]) {
      expect(path.startsWith('M')).toBe(true);
      expect(path.endsWith('Z')).toBe(true);
    }
  });

  it('uses one quadratic segment per corner', () => {
    // star(8, .86) alternates 8 outer and 8 inner vertices; the 4-petal clover
    // has 8; the pebble is a plain heptagon.
    expect(cornerCount(COOKIE_PATH)).toBe(16);
    expect(cornerCount(CLOVER_PATH)).toBe(8);
    expect(cornerCount(PEBBLE_PATH)).toBe(7);
  });

  it('emits an entry and an exit point for every corner', () => {
    // Each corner is drawn as "L entry Q vertex exit", so the two on-curve
    // points per corner are the entry and the exit.
    for (const path of [COOKIE_PATH, CLOVER_PATH, PEBBLE_PATH]) {
      expect(onCurvePoints(path)).toHaveLength(cornerCount(path) * 2);
    }
  });

  it('stays inside the 100x100 box so nothing is clipped', () => {
    for (const path of [COOKIE_PATH, CLOVER_PATH, PEBBLE_PATH]) {
      for (const value of onCurvePoints(path).flat()) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it('rounds the cookie rather than leaving a spiky star', () => {
    // Outer radius is 46 around a centre of 50, so the raw hull would reach 96.
    // Rounding must pull the drawn extremes inward while still filling the box.
    const { max } = extent(COOKIE_PATH);
    expect(max).toBeLessThan(96);
    expect(max).toBeGreaterThan(70);
  });

  it('keeps the clover narrower than the cookie', () => {
    expect(extent(CLOVER_PATH).spread).toBeLessThan(extent(COOKIE_PATH).spread);
  });

  it('routes each name to its path', () => {
    expect(shapePath('cookie')).toBe(COOKIE_PATH);
    expect(shapePath('clover')).toBe(CLOVER_PATH);
    expect(shapePath('pebble')).toBe(PEBBLE_PATH);
  });
});
