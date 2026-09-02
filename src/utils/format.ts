/** Seconds -> m:ss */
export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return m + ':' + String(s).padStart(2, '0');
}

/** 1280000 -> 128万 style compact number for CN audience. */
export function formatPlays(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return Math.round(n / 10000) + '万';
  return String(n);
}
