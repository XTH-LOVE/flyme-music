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
  /**
   * Cover URL, fetched natively.
   *
   * Only an http(s) URL is useful: the native side opens it with a plain
   * HttpURLConnection, which cannot read a data: URL, and local tracks render
   * their cover to exactly that.
   */
  cover?: string;
  /** Seconds. */
  duration?: number;
  /** Seconds. */
  position?: number;
  playing: boolean;
}

/**
 * `duck` and `unduck` are not buttons - they come from the audio focus system,
 * which asks the app to lower its volume for a short announcement and raise it
 * again. The system does not do this itself, so it has to be forwarded.
 */
export type MediaAction =
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'stop'
  | 'seek'
  | 'duck'
  | 'unduck';

interface NativeBridge {
  /** Returns false when "display over other apps" has not been granted. */
  showLyric(text: string, locked: boolean): boolean;
  updateLyric(text: string, locked: boolean): void;
  hideLyric(): void;
  canShowLyric(): boolean;
  openOverlaySettings(): void;
  /** `#RRGGBB` from the wallpaper palette, or empty before Android 12. */
  systemAccent(): string;
  update(
    title: string,
    artist: string,
    playing: boolean,
    positionSec: number,
    durationSec: number,
    artworkUrl: string,
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
      // Rejected rather than passed through: a data: URL is what local tracks
      // produce, and sending it would have the native side fail a download it
      // never needed to attempt.
      info.cover && /^https?:/i.test(info.cover) ? info.cover : '',
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
    // The bridge has no merge semantics of its own, so the metadata is resent
    // from the last known values by the caller. The cover is deliberately left
    // out: the native side keeps the bitmap it already fetched, and resending
    // the URL would not change it.
    native.update(lastTitle, lastArtist, playing, position, duration, '');
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

/* ---------------- Desktop lyrics ---------------- */

/**
 * Starts the floating lyric window.
 *
 * Returns false when the permission is missing, so the caller can send the
 * user to the system page instead of leaving a toggle that appears to do
 * nothing - which is how this feature usually fails.
 */
export function showDesktopLyric(text: string, locked: boolean): boolean {
  if (!isTauri()) return false;
  try {
    return bridge()?.showLyric(text, locked) ?? false;
  } catch (error) {
    console.warn('[nativeMedia] showLyric failed', error);
    return false;
  }
}

export function updateDesktopLyric(text: string, locked: boolean): void {
  if (!isTauri()) return;
  try {
    bridge()?.updateLyric(text, locked);
  } catch {
    // One line per lyric change; a failure here will have been reported by
    // showDesktopLyric when the overlay was turned on.
  }
}

export function hideDesktopLyric(): void {
  if (!isTauri()) return;
  try {
    bridge()?.hideLyric();
  } catch (error) {
    console.warn('[nativeMedia] hideLyric failed', error);
  }
}

export function canShowDesktopLyric(): boolean {
  if (!isTauri()) return false;
  try {
    return bridge()?.canShowLyric() ?? false;
  } catch {
    return false;
  }
}

/** Opens the system page for the overlay permission. */
export function openOverlaySettings(): void {
  if (!isTauri()) return;
  try {
    bridge()?.openOverlaySettings();
  } catch (error) {
    console.warn('[nativeMedia] openOverlaySettings failed', error);
  }
}

/* ---------------- Material You ---------------- */

/**
 * The wallpaper-derived accent, or null when the device has no palette.
 *
 * Read once at start rather than observed: the framework offers no callback for
 * a wallpaper change that would reach here, and a colour that updates on the
 * next launch is a fair trade for not polling.
 */
export function systemAccent(): string | null {
  if (!isTauri()) return null;
  try {
    const value = bridge()?.systemAccent() ?? '';
    return /^#[0-9a-f]{6}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** Remembered so `setNativePlaying` can resend the metadata the bridge requires. */
export function rememberTrack(title: string, artist: string): void {
  lastTitle = title;
  lastArtist = artist;
}
