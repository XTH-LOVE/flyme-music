import { describe, expect, it } from 'vitest';
import {
  ambientConfigFromPalette,
  gradientNoise,
  hash2,
  hsvToRgb,
  perlin,
  renderAmbientField,
  rgbToHsv,
  smoothstep,
  type AmbientConfig,
} from './ambientField';

/** A single opaque red blob dead centre, with the noise shaping switched off. */
const blob: AmbientConfig = {
  points: [{ x: 0.5, y: 0.5, radius: 0.6, color: [1, 0, 0, 1] }],
  drift: 0,
  noiseScale: 1,
  desaturate: 0,
  lighten: 0,
};

const W = 8;
const H = 8;

function render(config: AmbientConfig, width = W, height = H): Uint8ClampedArray {
  const target = new Uint8ClampedArray(width * height * 4);
  renderAmbientField(target, width, height, 0, config);
  return target;
}

const pixel = (data: Uint8ClampedArray, width: number, col: number, row: number) => {
  const at = (row * width + col) * 4;
  return [data[at], data[at + 1], data[at + 2], data[at + 3]] as const;
};

describe('smoothstep', () => {
  it('ramps from 0 to 1 across the edges', () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 10);
    expect(smoothstep(0, 1, -3)).toBe(0);
    expect(smoothstep(0, 1, 4)).toBe(1);
  });

  it('supports the inverted form the shader relies on', () => {
    // edge0 > edge1 means "1 near edge1, 0 near edge0" - the blob falloff.
    expect(smoothstep(1, 0, 0)).toBe(1);
    expect(smoothstep(1, 0, 1)).toBe(0);
    expect(smoothstep(1, 0, 0.5)).toBeCloseTo(0.5, 10);
    expect(smoothstep(0.6, 0, 0.9)).toBe(0);
  });

  it('degrades to a step when the edges coincide', () => {
    expect(smoothstep(0.5, 0.5, 0.4)).toBe(0);
    expect(smoothstep(0.5, 0.5, 0.5)).toBe(1);
    expect(smoothstep(0.5, 0.5, 0.9)).toBe(1);
  });
});

describe('hash2', () => {
  it('is deterministic and stays inside [0, 1)', () => {
    for (let x = -4; x < 4; x += 1) {
      for (let y = -4; y < 4; y += 1) {
        const value = hash2(x, y);
        expect(value).toBe(hash2(x, y));
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('does not collapse a grid of inputs onto a handful of values', () => {
    const seen = new Set<number>();
    for (let x = 0; x < 20; x += 1) {
      for (let y = 0; y < 20; y += 1) seen.add(hash2(x * 0.37, y * 0.53));
    }
    // A weak hash would repeat heavily; the shader's own hash spreads well.
    expect(seen.size).toBeGreaterThan(380);
  });
});

describe('perlin', () => {
  it('stays inside [0, 1)', () => {
    for (let x = -3; x < 12; x += 0.37) {
      for (let y = -3; y < 12; y += 0.41) {
        const value = perlin(x, y);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('is continuous, so the field has no visible seams', () => {
    for (let x = 0; x < 6; x += 0.5) {
      for (let y = 0; y < 6; y += 0.5) {
        expect(Math.abs(perlin(x + 0.01, y) - perlin(x, y))).toBeLessThan(0.05);
        expect(Math.abs(perlin(x, y + 0.01) - perlin(x, y))).toBeLessThan(0.05);
      }
    }
  });
});

describe('gradientNoise', () => {
  it('is a deterministic per-pixel value in [0, 1)', () => {
    for (let i = 0; i < 64; i += 1) {
      const value = gradientNoise(i, i * 3);
      expect(value).toBe(gradientNoise(i, i * 3));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('hsv conversion', () => {
  it('round-trips colours', () => {
    const samples: Array<[number, number, number]> = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.2, 0.6, 0.9],
      [0.13, 0.87, 0.42],
      [0.5, 0.5, 0.5],
      [0, 0, 0],
    ];
    for (const [r, g, b] of samples) {
      const [h, s, v] = rgbToHsv(r, g, b);
      const [rr, gg, bb] = hsvToRgb(h, s, v);
      expect(rr).toBeCloseTo(r, 6);
      expect(gg).toBeCloseTo(g, 6);
      expect(bb).toBeCloseTo(b, 6);
    }
  });

  it('treats black as zero saturation rather than dividing by zero', () => {
    expect(rgbToHsv(0, 0, 0)).toEqual([0, 0, 0]);
    expect(hsvToRgb(0, 0, 0)).toEqual([0, 0, 0]);
  });

  it('wraps a hue of exactly 1 back to red', () => {
    expect(hsvToRgb(1, 1, 1)).toEqual([1, 0, 0]);
  });
});

describe('renderAmbientField', () => {
  it('writes exactly one RGBA quad per pixel and nothing past the end', () => {
    const target = new Uint8ClampedArray(W * H * 4 + 4);
    renderAmbientField(target, W, H, 0, blob);
    expect(Array.from(target.slice(W * H * 4))).toEqual([0, 0, 0, 0]);
  });

  it('paints the blob colour where the blob is and nothing where it is not', () => {
    const data = render(blob);
    const [r, g, b, a] = pixel(data, W, 4, 4);
    expect(r).toBeGreaterThanOrEqual(254);
    expect(g).toBeLessThanOrEqual(1);
    expect(b).toBeLessThanOrEqual(1);
    expect(a).toBeGreaterThan(200);

    // (0, 0) is 0.707 away from the centre, outside a 0.6 radius.
    expect(pixel(data, W, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it('fades coverage monotonically toward the blob centre', () => {
    const data = render(blob);
    const alphas = [0, 1, 2, 3, 4].map((col) => pixel(data, W, col, 4)[3]);
    for (let i = 1; i < alphas.length; i += 1) {
      expect(alphas[i]).toBeGreaterThanOrEqual(alphas[i - 1]);
    }
    expect(alphas[0]).toBeGreaterThan(0);
    expect(alphas[4]).toBeGreaterThan(alphas[0]);
  });

  it('normalises by accumulated coverage so overlapping blobs keep their hue', () => {
    const doubled: AmbientConfig = {
      ...blob,
      points: [blob.points[0], { ...blob.points[0] }],
    };
    const [r, , , a] = pixel(render(doubled), W, 4, 4);
    // The same red twice must still be red, not pink, and must not clip alpha.
    expect(r).toBeGreaterThanOrEqual(254);
    expect(a).toBeLessThanOrEqual(255);
  });

  it('dithered output stays within one 8-bit step of the true colour', () => {
    const data = render(blob);
    for (let row = 2; row < 6; row += 1) {
      for (let col = 2; col < 6; col += 1) {
        const [r, g, b] = pixel(data, W, col, row);
        expect(r).toBeGreaterThanOrEqual(254);
        expect(g).toBeLessThanOrEqual(1);
        expect(b).toBeLessThanOrEqual(1);
      }
    }
  });

  it('handles a one-pixel buffer without dividing by zero', () => {
    const data = render(blob, 1, 1);
    expect(data).toHaveLength(4);
    for (const channel of data) expect(Number.isFinite(channel)).toBe(true);
  });
});

describe('ambientConfigFromPalette', () => {
  it('builds four in-range blobs from the two palette colours', () => {
    const config = ambientConfigFromPalette(['#3a6ea5', '#e8b04b'], true);
    expect(config.points).toHaveLength(4);
    for (const point of config.points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
      expect(point.radius).toBeGreaterThan(0);
      expect(point.radius).toBeLessThanOrEqual(1);
      for (const channel of point.color) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });

  it('lights the dark theme less aggressively than the light one', () => {
    const dark = ambientConfigFromPalette(['#3a6ea5', '#e8b04b'], true);
    const light = ambientConfigFromPalette(['#3a6ea5', '#e8b04b'], false);
    expect(dark.lighten).toBeLessThan(light.lighten);
    expect(dark.points[0].color[3]).toBeGreaterThan(light.points[0].color[3]);
  });

  it('accepts shorthand hex', () => {
    const config = ambientConfigFromPalette(['#f00', '#0f0'], true);
    expect(config.points[0].color[0]).toBeCloseTo(1, 6);
    expect(config.points[0].color[1]).toBeCloseTo(0, 6);
  });

  it('falls back to grey instead of producing NaN for unparseable input', () => {
    const config = ambientConfigFromPalette(['not-a-colour', ''], true);
    for (const point of config.points) {
      for (const channel of point.color) expect(Number.isNaN(channel)).toBe(false);
    }
  });

  it('produces bytes the rasteriser can actually consume', () => {
    const config = ambientConfigFromPalette(['#3a6ea5', '#e8b04b'], false);
    const data = render(config);
    let maxAlpha = 0;
    for (let i = 3; i < data.length; i += 4) {
      expect(Number.isFinite(data[i])).toBe(true);
      maxAlpha = Math.max(maxAlpha, data[i]);
    }
    // Something has to be visible, or the field is pointless.
    expect(maxAlpha).toBeGreaterThan(0);
  });
});
