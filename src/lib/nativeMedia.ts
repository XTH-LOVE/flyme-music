/**
 * The notification-shade player, via `tauri-plugin-media-session`.
 *
 * This replaced a hand-written Android plugin - a Kotlin MediaSessionCompat, a
 * foreground service, a permission file and the ACL entries to let the page
 * call it. That version never worked, and the reason is worth keeping: the
 * plugin's commands were invoked from JavaScript, so they passed through
 * Tauri's ACL, which Tauri's own Android plugins never have to because they are
 * only called from Rust. Every call was rejected before reaching Kotlin, and a
 * `catch` in this file swallowed the rejection - so the notification simply
 * never appeared and nothing said why.
 *
 * The maintained plugin also handles the Android 13 notification permission and
 * downloads artwork natively, both of which had been separate problems here.
 *
 * Note the units: the plugin takes seconds, where the rest of this app works in
 * milliseconds.
 */

import { isTauri } from '@/lib/apiTransport';
import { notify } from '@/utils/notify';

export interface NowPlaying {
  title: string;
  artist?: string;
  album?: string;
  /** Cover URL; the plugin fetches and decodes it natively. */
  cover?: string;
  /** Seconds. */
  duration?: number;
  /** Seconds. */
  position?: number;
  playing: boolean;
}

export type MediaAction = 'play' | 'pause' | 'next' | 'previous' | 'stop' | 'seek';

/** `listen` hands back an unsubscribe function, not an object. */
let unlisten: (() => void) | null = null;
let reported = false;
let announcedAction = false;

/**
 * Reports a failure once per session, in the interface.
 *
 * Every call here used to end in `console.warn`, which on a phone is nowhere.
 * A notification that does not appear is then indistinguishable from
 * notification code that is wrong, and this cost several rounds of guessing
 * before the cause turned out to be rejected calls. A problem that cannot be
 * seen gets guessed at.
 */
function reportOnce(detail: string): void {
  if (reported) return;
  reported = true;
  notify('通知栏播放器不可用：' + detail.slice(0, 60), 5000);
  console.warn('[nativeMedia]', detail);
}

async function call(command: string, args?: Record<string, unknown>): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke(command, args);
}

/** Publishes the current track. Omitted fields keep their previous values. */
export async function updateNativeNowPlaying(info: NowPlaying): Promise<void> {
  if (!isTauri()) return;
  try {
    await call('media_update_state', {
      state: {
        title: info.title,
        artist: info.artist ?? '',
        album: info.album ?? '',
        ...(info.cover ? { artworkUrl: info.cover } : {}),
        ...(info.duration ? { duration: info.duration } : {}),
        ...(info.position !== undefined ? { position: info.position } : {}),
        isPlaying: info.playing,
        canPrev: true,
        canNext: true,
      },
    });
  } catch (error) {
    reportOnce(error instanceof Error ? error.message : String(error));
  }
}

/** Play/pause only, for the frequent case. */
export async function setNativePlaying(playing: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await call('media_update_state', { state: { isPlaying: playing } });
  } catch (error) {
    reportOnce(error instanceof Error ? error.message : String(error));
  }
}

/** Position and speed without rebuilding the notification. Seconds. */
export async function setNativePosition(position: number, playbackSpeed: number): Promise<void> {
  if (!isTauri()) return;
  try {
    await call('media_update_timeline', { timeline: { position, playbackSpeed } });
  } catch {
    // Position sync runs often; a failure here is not worth a notification,
    // and updateNativeNowPlaying will have reported the same underlying fault.
  }
}

/** Removes the notification when playback stops entirely. */
export async function clearNativeNowPlaying(): Promise<void> {
  if (!isTauri()) return;
  try {
    await call('media_clear');
  } catch (error) {
    reportOnce(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Subscribes to transport presses.
 *
 * The plugin emits a Tauri event rather than requiring a plugin listener, so
 * this uses `listen` from the core API - covered by `core:default`, with none
 * of the ACL questions a plugin command would raise.
 */
export async function onNativeMediaAction(
  handler: (action: MediaAction, seekPosition?: number) => void,
): Promise<void> {
  if (!isTauri() || unlisten) return;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    unlisten = await listen<{ action?: string; seekPosition?: number }>('media_action', (event) => {
      const action = event.payload?.action;
      if (!action) return;
      // Announced once so it is visible whether the button press reaches the
      // page at all. That is the fork in the road: if this never appears the
      // notification's buttons are not being delivered, and if it appears but
      // playback does not change the fault is downstream of here. Without it
      // both look identical from the outside.
      if (!announcedAction) {
        announcedAction = true;
        notify('收到通知栏操作：' + action, 2500);
      }
      console.warn('[nativeMedia] action', action);
      handler(action as MediaAction, event.payload?.seekPosition);
    });
  } catch (error) {
    reportOnce(error instanceof Error ? error.message : String(error));
  }
}
