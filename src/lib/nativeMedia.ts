/**
 * The Android notification-shade player.
 *
 * `navigator.mediaSession` already drives lock-screen and headset controls on
 * the web, but in a Tauri WebView it never produces a notification - posting one
 * is a browser feature, not a WebView one. So the packaged app posts its own,
 * built by the `media` plugin, and this module is the two directions of that
 * conversation:
 *
 *   page -> Kotlin   metadata and play/pause state
 *   Kotlin -> page   transport button presses, so the single player in the
 *                    WebView stays the only thing that decides what plays
 */

import { isTauri } from '@/lib/apiTransport';

interface NowPlaying {
  title: string;
  artist?: string;
  album?: string;
  /** Cover URL; the plugin fetches and decodes it. */
  cover?: string;
  /** Milliseconds. */
  duration?: number;
  playing: boolean;
}

let listener: { unregister: () => Promise<void> } | null = null;

async function invoke(command: string, args?: Record<string, unknown>): Promise<void> {
  const { invoke: call } = await import('@tauri-apps/api/core');
  // The command name is the Kotlin method name verbatim - Tauri's Android
  // plugin registry keys commands by `Method.name` with no case conversion.
  await call('plugin:media|' + command, args);
}

/** Pushes the current track to the notification. Safe to call on every change. */
export async function updateNativeNowPlaying(info: NowPlaying): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('updateNowPlaying', {
      title: info.title,
      artist: info.artist ?? '',
      album: info.album ?? '',
      cover: info.cover ?? '',
      duration: info.duration ?? 0,
      playing: info.playing,
    });
  } catch (error) {
    // A missing notification must never break playback.
    console.warn('native media: update failed', error);
  }
}

/** Pushes only the play/pause state, for the frequent case. */
export async function setNativePlaying(playing: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('setPlaying', { playing });
  } catch {
    /* see above */
  }
}

/** Removes the notification when playback stops entirely. */
export async function clearNativeNowPlaying(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('clear');
  } catch {
    /* see above */
  }
}

/**
 * Subscribes to transport presses from the notification.
 *
 * Registered once; calling it again replaces the previous handler rather than
 * stacking listeners, because a second subscription would fire every action
 * twice and the player would skip two tracks per tap.
 */
export async function onNativeMediaAction(
  handler: (action: 'play' | 'pause' | 'next' | 'previous' | 'stop') => void,
): Promise<void> {
  if (!isTauri() || listener) return;
  try {
    const { addPluginListener } = await import('@tauri-apps/api/core');
    listener = await addPluginListener('media', 'action', (payload: { action?: string }) => {
      const action = payload?.action;
      if (action) handler(action as 'play' | 'pause' | 'next' | 'previous' | 'stop');
    });
  } catch (error) {
    console.warn('native media: listener failed', error);
  }
}
