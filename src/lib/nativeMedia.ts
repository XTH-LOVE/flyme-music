/**
 * The notification-shade player.
 *
 * The Android side is a plain `@JavascriptInterface` bridge rather than a Tauri
 * plugin. That is not a stylistic preference: a plugin's commands are invoked
 * from JavaScript, so they pass through Tauri's ACL, which the framework's own
 * Android plugins never have to because they are only called from Rust. An
 * earlier version of this file spent several rounds calling a plugin whose
 * every invocation was rejected before it reached Kotlin, with the rejection
 * swallowed by a `catch` - so the notification never appeared and nothing said
 * why. `onWebViewCreate` hands over the WebView directly, so both directions
 * are a plain call and there is nothing in between to fail quietly.
 *
 * Units are seconds throughout, matching the native side.
 */

import { isTauri } from '@/lib/apiTransport';

export interface NowPlaying {
  title: string;
  artist?: string;
  /** Seconds. */
  duration?: number;
  /** Seconds. */
  position?: number;
  playing: boolean;
}

export type MediaAction = 'play' | 'pause' | 'next' | 'previous' | 'stop' | 'seek';

interface NativeBridge {
  update(
    title: string,
    artist: string,
    playing: boolean,
    positionSec: number,
    durationSec: number,
  ): void;
  stop(): void;
}

declare global {
  interface Window {
    FlymeMedia?: NativeBridge;
    __flymeMediaAction?: (action: string) => void;
  }
}

const bridge = (): NativeBridge | undefined =>
  typeof window === 'undefined' ? undefined : window.FlymeMedia;

/** Publishes the current track. Safe to call often; the native side merges. */
export function updateNativeNowPlaying(info: NowPlaying): void {
  if (!isTauri()) return;
  const native = bridge();
  if (!native) return;
  try {
    native.update(
      info.title,
      info.artist ?? '',
      info.playing,
      info.position ?? 0,
      info.duration ?? 0,
    );
  } catch (error) {
    // A missing notification must never break playback, so this does not
    // rethrow - but it is not silent either, because silence is what made the
    // previous version take several rounds to diagnose.
    console.warn('[nativeMedia] update failed', error);
  }
}

/** Play/pause only, for the frequent case. */
export function setNativePlaying(playing: boolean, position = 0, duration = 0): void {
  if (!isTauri()) return;
  const native = bridge();
  if (!native) return;
  try {
    // The bridge has no merge semantics of its own, so the title and artist
    // are resent from the last known values by the caller.
    native.update(lastTitle, lastArtist, playing, position, duration);
  } catch (error) {
    console.warn('[nativeMedia] setPlaying failed', error);
  }
}

let lastTitle = '';
let lastArtist = '';

/** Removes the notification when playback stops entirely. */
export function clearNativeNowPlaying(): void {
  if (!isTauri()) return;
  try {
    bridge()?.stop();
  } catch (error) {
    console.warn('[nativeMedia] clear failed', error);
  }
}

/**
 * Registers the handler the native side calls for transport presses.
 *
 * A plain global function rather than a listener: `evaluateJavascript` calls it
 * by name, and a name that exists only while this module is loaded is the
 * simplest thing that can work.
 */
export function onNativeMediaAction(handler: (action: MediaAction) => void): void {
  if (!isTauri() || typeof window === 'undefined') return;
  window.__flymeMediaAction = (raw: string) => {
    if (raw.startsWith('seek:')) {
      handler('seek');
      return;
    }
    handler(raw as MediaAction);
  };
}

/** Remembered so `setNativePlaying` can resend the metadata the bridge requires. */
export function rememberTrack(title: string, artist: string): void {
  lastTitle = title;
  lastArtist = artist;
}
