import { describe, expect, it } from 'vitest';
import {
  SILENT_CHECK_INTERVAL_MS,
  compareVersions,
  formatBytes,
  isNewerVersion,
  isPrereleaseVersion,
  parseVersion,
  shouldCheckNow,
} from './versionCompare';

describe('parseVersion', () => {
  it('strips a leading v', () => {
    // The regression this guards: tags are `v2.0.2` while the app reports
    // `2.0.2`. Comparing those literally makes `v` sort above every digit, so
    // "up to date" reads as "update available" forever.
    expect(parseVersion('v2.0.2')).toEqual([2, 0, 2]);
    expect(parseVersion('V1.2.3')).toEqual([1, 2, 3]);
  });

  it('drops a pre-release suffix', () => {
    expect(parseVersion('2.0.0-beta.1')).toEqual([2, 0, 0]);
    expect(parseVersion('v2.0.0-rc1')).toEqual([2, 0, 0]);
    expect(parseVersion('1.4.2+sha.abc123')).toEqual([1, 4, 2]);
  });

  it('keeps a short version short, so padding is what equalises it', () => {
    expect(parseVersion('2.1')).toEqual([2, 1]);
    expect(parseVersion('2')).toEqual([2]);
  });

  it('never returns an empty vector', () => {
    expect(parseVersion('')).toEqual([0]);
    expect(parseVersion('nonsense')).toEqual([0]);
    expect(parseVersion(null)).toEqual([0]);
    expect(parseVersion(undefined)).toEqual([0]);
  });
});

describe('compareVersions', () => {
  it('compares numerically, not lexically', () => {
    // `'1.10.0' < '1.9.0'` as strings, which would offer the user a downgrade.
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '10.0.0')).toBe(-1);
  });

  it('treats a missing component as zero', () => {
    expect(compareVersions('2.1', '2.1.0')).toBe(0);
    expect(compareVersions('2.1.0', '2.1')).toBe(0);
    expect(compareVersions('2', '2.0.0')).toBe(0);
  });

  it('ignores the v prefix on both sides', () => {
    expect(compareVersions('v2.0.2', '2.0.2')).toBe(0);
    expect(compareVersions('2.0.2', 'v2.0.3')).toBe(-1);
  });

  it('reports equality for the same version', () => {
    expect(compareVersions('0.3.0', '0.3.0')).toBe(0);
  });

  it('ignores pre-release suffixes when the numbers match', () => {
    // Deliberate: a `-beta` tag is not offered as an upgrade to someone on the
    // same number, and it must not read as a downgrade either.
    expect(compareVersions('2.0.0', '2.0.0-beta.1')).toBe(0);
  });

  it('handles a real upgrade and a real downgrade', () => {
    expect(compareVersions('0.3.0', '0.4.0')).toBe(-1);
    expect(compareVersions('0.4.0', '0.3.0')).toBe(1);
    expect(compareVersions('0.3.0', '1.0.0')).toBe(-1);
  });
});

describe('isNewerVersion', () => {
  it('is true only for a strictly newer version', () => {
    expect(isNewerVersion('0.4.0', '0.3.0')).toBe(true);
    expect(isNewerVersion('0.3.0', '0.3.0')).toBe(false);
    expect(isNewerVersion('0.3.0', '0.4.0')).toBe(false);
  });

  it('is not fooled by the v prefix on either side', () => {
    expect(isNewerVersion('v0.4.0', '0.3.0')).toBe(true);
    expect(isNewerVersion('v0.3.0', '0.3.0')).toBe(false);
  });
});

describe('isPrereleaseVersion', () => {
  it('recognises the suffixes the release workflow marks as prerelease', () => {
    for (const tag of ['v0.4.0-beta', '0.4.0-beta.1', '0.4.0-rc1', '0.4.0-alpha', '0.4.0-preview']) {
      expect(isPrereleaseVersion(tag), tag).toBe(true);
    }
  });

  it('does not mistake a stable version for a prerelease', () => {
    for (const tag of ['v0.4.0', '0.4.0', '1.0.0']) {
      expect(isPrereleaseVersion(tag), tag).toBe(false);
    }
  });

  it('does not match a suffix that merely contains the word', () => {
    // `0.4.0-betamax` is not a beta.
    expect(isPrereleaseVersion('0.4.0-betamax')).toBe(false);
  });
});

describe('formatBytes', () => {
  it('uses binary units, matching what a file manager shows', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024 * 18.4)).toBe('18.4 MB');
  });

  it('drops a decimal that carries no information', () => {
    // The regression this guards: rounding above ten turned an 18.4 MB download
    // into "18 MB", which is the number a user checks against their data plan.
    expect(formatBytes(1024 * 1024 * 42)).toBe('42 MB');
    expect(formatBytes(1024 * 1024 * 42.25)).toBe('42.3 MB');
  });

  it('refuses to invent a value', () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(undefined)).toBeNull();
    expect(formatBytes(-1)).toBeNull();
    expect(formatBytes(Number.NaN)).toBeNull();
  });

  it('handles zero as a real number', () => {
    expect(formatBytes(0)).toBe('0 B');
  });
});

describe('shouldCheckNow', () => {
  const now = 1_700_000_000_000;

  it('always allows a manual check', () => {
    // The user pressed the button; throttling it would look like a broken button.
    expect(shouldCheckNow(now - 1000, false, now)).toBe(true);
    expect(shouldCheckNow(now, false, now)).toBe(true);
  });

  it('allows the first silent check', () => {
    expect(shouldCheckNow(0, true, now)).toBe(true);
    expect(shouldCheckNow(null, true, now)).toBe(true);
    expect(shouldCheckNow(undefined, true, now)).toBe(true);
  });

  it('throttles a silent check to once a day', () => {
    expect(shouldCheckNow(now - 1000, true, now)).toBe(false);
    expect(shouldCheckNow(now - SILENT_CHECK_INTERVAL_MS + 1, true, now)).toBe(false);
  });

  it('allows a silent check once the interval has passed', () => {
    expect(shouldCheckNow(now - SILENT_CHECK_INTERVAL_MS, true, now)).toBe(true);
    expect(shouldCheckNow(now - SILENT_CHECK_INTERVAL_MS * 2, true, now)).toBe(true);
  });
});
