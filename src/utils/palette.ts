const PALETTES: [string, string][] = [
  ['#3D7BFF', '#8FB0FF'],
  ['#7B4FE0', '#C8A8FF'],
  ['#2FA96B', '#A8E8C0'],
  ['#F2A65A', '#FFD8A0'],
  ['#D85A7A', '#FFB8C8'],
  ['#009A93', '#80E0D8'],
];

/** Deterministic gradient art for tracks without a palette (remote songs). */
export function fallbackPalette(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}
