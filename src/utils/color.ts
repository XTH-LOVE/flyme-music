/** Minimal color helpers for the dynamic ambient player background. */

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

/** Mix a color towards white (amount 0..1). */
export function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return 'rgb(' + mix(r) + ', ' + mix(g) + ', ' + mix(b) + ')';
}

/** Mix a color towards black (amount 0..1). */
export function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c * (1 - amount));
  return 'rgb(' + mix(r) + ', ' + mix(g) + ', ' + mix(b) + ')';
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [
    Math.round(hue(h + 1 / 3) * 255),
    Math.round(hue(h) * 255),
    Math.round(hue(h - 1 / 3) * 255),
  ];
}

/** Push a color towards a pleasant, richer tone for ambient gradients. */
function enrich(r: number, g: number, b: number): string {
  const [h, s, l] = rgbToHsl(r, g, b);
  const ns = Math.min(0.62, s * 1.35 + 0.1);
  const nl = Math.max(0.24, Math.min(0.52, l));
  const [nr, ng, nb] = hslToRgb(h, ns, nl);
  return rgbToHex(nr, ng, nb);
}

/**
 * Extract a two-tone ambient palette from an image via canvas.
 * The image must be same-origin (load it through the dev image proxy).
 */
export function extractAmbientPalette(img: HTMLImageElement): [string, string] | null {
  try {
    const size = 28;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    let r1 = 0, g1 = 0, b1 = 0, n1 = 0;
    let r2 = 0, g2 = 0, b2 = 0, n2 = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (y < size / 2) {
          r1 += r; g1 += g; b1 += b; n1++;
        } else {
          r2 += r; g2 += g; b2 += b; n2++;
        }
      }
    }
    const top = enrich(Math.round(r1 / n1), Math.round(g1 / n1), Math.round(b1 / n1));
    const bottom = enrich(Math.round(r2 / n2), Math.round(g2 / n2), Math.round(b2 / n2));
    return [top, bottom];
  } catch {
    return null;
  }
}
