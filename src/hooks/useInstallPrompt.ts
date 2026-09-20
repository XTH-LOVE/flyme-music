import { useCallback, useEffect, useState } from 'react';
import { isTauri } from '@/lib/apiTransport';

/**
 * Installing the web build as an app.
 *
 * The manifest and service worker have been in place for a while, but nothing
 * in the UI ever mentioned installing, so the only route was the browser's own
 * menu - which most people never open. Offline playback is already there
 * (IndexedDB caches plus the service worker), and it is unreachable in practice
 * without installing first.
 *
 * Chromium fires `beforeinstallprompt` and lets the page trigger the dialog.
 * Safari never fires it, on any platform, so iOS gets instructions instead -
 * otherwise the one install path iOS users have would stay invisible.
 */

export type InstallAffordance =
  /** Chromium offered a prompt: show a button that opens the dialog. */
  | 'prompt'
  /** No programmatic prompt exists; tell the user where the menu item is. */
  | 'ios_manual'
  /** Already installed, or this platform cannot install at all. */
  | 'unavailable';

/** iOS reports iPad as "Macintosh", so touch support has to disambiguate it. */
export function isIosSafari(userAgent: string, maxTouchPoints = 0): boolean {
  if (!userAgent) return false;
  const iosDevice = /iPad|iPhone|iPod/.test(userAgent);
  const iPadOs = /Macintosh/.test(userAgent) && maxTouchPoints > 1;
  if (!iosDevice && !iPadOs) return false;
  // Every iOS browser is WebKit, but only Safari exposes Add to Home Screen.
  return !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(userAgent);
}

export interface InstallContext {
  /** A `beforeinstallprompt` event has been captured. */
  hasPromptEvent: boolean;
  /** Already running as an installed app. */
  standalone: boolean;
  /** The packaged desktop/mobile app - installing is meaningless there. */
  desktopApp: boolean;
  userAgent: string;
  maxTouchPoints?: number;
}

/**
 * Which install affordance this environment supports, if any.
 *
 * Pure so every branch can be pinned down: getting this wrong either hides the
 * only install path a platform has, or offers a button that does nothing.
 */
export function installAffordance(input: InstallContext): InstallAffordance {
  if (input.desktopApp || input.standalone) return 'unavailable';
  if (input.hasPromptEvent) return 'prompt';
  if (isIosSafari(input.userAgent, input.maxTouchPoints ?? 0)) return 'ios_manual';
  return 'unavailable';
}

/** Chrome's install event is not in the DOM lib. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari predates the media query and exposes its own flag.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

export interface InstallPrompt {
  affordance: InstallAffordance;
  /** Opens the browser dialog. Returns the user's answer, or null if unavailable. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | null>;
}

export function useInstallPrompt(): InstallPrompt {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Chromium shows its own mini-infobar unless the page takes over, and the
      // event is only usable once - so it is captured here and replayed when the
      // user presses our button.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setStandalone(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return null;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    // The captured event cannot be reused, so drop it either way: on accept the
    // affordance disappears, on dismiss Chromium decides whether to re-offer.
    setDeferred(null);
    return choice.outcome;
  }, [deferred]);

  return {
    affordance: installAffordance({
      hasPromptEvent: Boolean(deferred),
      standalone,
      desktopApp: isTauri(),
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
    }),
    promptInstall,
  };
}
