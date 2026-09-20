import type { AudioQuality } from '@/store/useSettingsStore';

/**
 * Bitrate to request for a quality setting.
 *
 * One definition on purpose. The resolved stream URL is cached per bitrate
 * (`source:url_id:br`), so a caller that computes this mapping differently does
 * not share the cache entry - it warms a second one, or misses the one playback
 * is about to ask for. That was already duplicated across the player and the
 * download path; a prefetch would have made it three.
 */
export function bitrateForQuality(quality: AudioQuality): number {
  return quality === 'lossless' ? 999 : quality === 'high' ? 320 : 192;
}
