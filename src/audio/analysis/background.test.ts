// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/store/useSettingsStore';
import { shouldSpendBandwidth } from './background';

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
