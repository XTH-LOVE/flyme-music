// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/store/useSettingsStore';
import { isMeteredConnection, shouldSpendBandwidth } from './background';

/**
 * Background analysis downloads whole tracks. It runs unattended, so the gate
 * that decides whether that is acceptable is the most important part of the
 * module - spending someone's mobile data to build our own index is not a trade
 * they agreed to.
 */
function setConnection(value: unknown): void {
  Object.defineProperty(navigator, 'connection', { value, configurable: true, writable: true });
}

beforeEach(() => {
  useSettingsStore.setState({ backgroundAnalysis: true });
  setConnection(undefined);
});

afterEach(() => {
  setConnection(undefined);
  vi.restoreAllMocks();
});

describe('shouldSpendBandwidth', () => {
  it('allows analysis on an ordinary connection', () => {
    expect(shouldSpendBandwidth().ok).toBe(true);
  });

  it('refuses when the user turned it off', () => {
    useSettingsStore.setState({ backgroundAnalysis: false });
    const result = shouldSpendBandwidth();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('disabled');
  });

  it('refuses when the user asked to save data', () => {
    setConnection({ saveData: true, effectiveType: '4g' });
    const result = shouldSpendBandwidth();
    expect(result.ok).toBe(false);
    // Explicit user preference beats a fast connection.
    expect(result.reason).toBe('save_data');
  });

  it('refuses on cellular data', () => {
    setConnection({ type: 'cellular', effectiveType: '4g' });
    const result = shouldSpendBandwidth();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('metered');
  });

  it('refuses on slow effective types', () => {
    for (const effectiveType of ['slow-2g', '2g']) {
      setConnection({ effectiveType });
      expect(shouldSpendBandwidth().ok, effectiveType).toBe(false);
    }
  });

  it('allows on 3g and 4g over a non-cellular connection', () => {
    // `effectiveType` alone is not enough to call it metered: a slow wifi link
    // still is not the user's mobile data.
    for (const effectiveType of ['3g', '4g']) {
      setConnection({ type: 'wifi', effectiveType });
      expect(shouldSpendBandwidth().ok, effectiveType).toBe(true);
    }
  });

  it('allows when the browser exposes no connection information', () => {
    // Firefox and Safari have no Network Information API; refusing there would
    // disable the feature for everyone on those browsers.
    setConnection(undefined);
    expect(shouldSpendBandwidth().ok).toBe(true);
  });
});

/**
 * The connection fact is separate from the analysis setting: the next-track
 * audio prefetch honours one and not the other, so a metered check that
 * followed the setting would either leak data or block prefetching.
 */
describe('isMeteredConnection', () => {
  it('is false on an ordinary connection', () => {
    setConnection({ effectiveType: '4g', type: 'wifi' });
    expect(isMeteredConnection()).toBe(false);
  });

  it('is true on cellular and when the user asked to save data', () => {
    setConnection({ type: 'cellular' });
    expect(isMeteredConnection()).toBe(true);
    setConnection({ saveData: true, effectiveType: '4g' });
    expect(isMeteredConnection()).toBe(true);
  });

  it('ignores the analysis setting, which does not govern playback', () => {
    setConnection({ type: 'cellular' });
    useSettingsStore.setState({ backgroundAnalysis: true });
    expect(isMeteredConnection()).toBe(true);
    useSettingsStore.setState({ backgroundAnalysis: false });
    // Still true: turning analysis off says nothing about the connection.
    expect(isMeteredConnection()).toBe(true);
    setConnection(undefined);
    useSettingsStore.setState({ backgroundAnalysis: false });
    // And an ordinary connection is usable even with analysis disabled.
    expect(isMeteredConnection()).toBe(false);
  });
});
