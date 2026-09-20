// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { installAffordance, isIosSafari } from './useInstallPrompt';

/**
 * Getting this wrong has two failure modes and neither is visible in a build:
 * hiding the only install path a platform has, or offering a button that does
 * nothing when pressed. The UA strings are real ones.
 */
const UA = {
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipadSafari:
    'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  // iPadOS 13+ asks for the desktop site, so it reports itself as a Mac.
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.6045.109 Mobile/15E148 Safari/604.1',
};

describe('isIosSafari', () => {
  it('recognises iPhone and iPad Safari', () => {
    expect(isIosSafari(UA.iphoneSafari)).toBe(true);
    expect(isIosSafari(UA.ipadSafari)).toBe(true);
  });

  it('recognises iPadOS pretending to be a Mac', () => {
    // Same UA string as desktop Safari; only the touch points tell them apart.
    expect(isIosSafari(UA.ipadDesktopMode, 5)).toBe(true);
    expect(isIosSafari(UA.macSafari, 0)).toBe(false);
  });

  it('excludes other iOS browsers, which have no Add to Home Screen', () => {
    expect(isIosSafari(UA.iphoneChrome)).toBe(false);
  });

  it('excludes everything else', () => {
    expect(isIosSafari(UA.windowsChrome)).toBe(false);
    expect(isIosSafari(UA.androidChrome)).toBe(false);
    expect(isIosSafari('')).toBe(false);
  });
});

describe('installAffordance', () => {
  const base = { hasPromptEvent: false, standalone: false, desktopApp: false, userAgent: UA.windowsChrome };

  it('offers the button when Chromium provided a prompt', () => {
    expect(installAffordance({ ...base, hasPromptEvent: true })).toBe('prompt');
  });

  it('gives iOS instructions instead of a button it cannot press', () => {
    expect(installAffordance({ ...base, userAgent: UA.iphoneSafari })).toBe('ios_manual');
    expect(installAffordance({ ...base, userAgent: UA.ipadDesktopMode, maxTouchPoints: 5 })).toBe('ios_manual');
  });

  it('offers nothing where installing is impossible', () => {
    // Firefox never fires the event and cannot install.
    expect(installAffordance({ ...base, userAgent: UA.windowsFirefox })).toBe('unavailable');
    // Chrome on iOS is WebKit and has no home-screen entry.
    expect(installAffordance({ ...base, userAgent: UA.iphoneChrome })).toBe('unavailable');
  });

  it('offers nothing once it is already installed', () => {
    expect(installAffordance({ ...base, hasPromptEvent: true, standalone: true })).toBe('unavailable');
  });

  it('offers nothing inside the packaged app', () => {
    expect(
      installAffordance({ ...base, hasPromptEvent: true, desktopApp: true }),
    ).toBe('unavailable');
  });
});
