import type { MusicTrack } from '@/music/source/types';
import { withPicSize } from './imgFallback';

/**
 * OS notification on track change while the tab/app is hidden. The browser
 * permission prompt is only ever triggered from the Settings toggle, never
 * implicitly during playback.
 */

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function nowPlayingPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNowPlayingPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/** Fire-and-forget lock-screen style notification; silently no-ops elsewhere. */
export function notifyNowPlaying(track: MusicTrack): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  // Only when the user is not looking at the app - otherwise it is noise.
  if (!document.hidden) return;
  try {
    const icon = track.picUrl ? withPicSize(track.picUrl, '96y96') : undefined;
    const n = new Notification(track.name, {
      body: track.artist.join(' / '),
      icon,
      tag: 'aurora-now-playing',
    });
    window.setTimeout(() => n.close(), 6000);
  } catch {
    /* some engines throw on icons from file:// etc. */
  }
}
