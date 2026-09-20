/**
 * Version comparison for the update check.
 *
 * Ported from Otter Music's `app-store.ts`, which had the two details that make
 * an update check trustworthy and are easy to leave out:
 *
 *   1. **The `v` prefix is stripped before comparing.** Their tags are `v2.0.2`
 *      while the app reports `2.0.2`. Comparing those literally puts `v` above
 *      every digit, so "up to date" reads as "update available" forever.
 *   2. **Comparison is numeric, not lexical.** `1.10.0` is newer than `1.9.0`,
 *      but as strings `'1.10.0' < '1.9.0'`. A naive string compare offers a
 *      downgrade.
 *
 * Kept pure and free of any fetch, so the rules can be tested directly - the
 * network part of an update check is the easy half.
 */

/**
 * Normalises a version string to `major.minor.patch`-ish digits.
 *
 * Strips a leading `v`, drops any pre-release or build suffix (`-beta.1`,
 * `+sha`), and pads nothing: `2.1` stays `[2, 1]` rather than becoming
 * `[2, 1, 0]`, so it compares equal to `2.1.0` by the padding rule in
 * `compareVersions`.
 */
export function parseVersion(version: string | null | undefined): number[] {
  if (typeof version !== 'string') return [0];
  const cleaned = version.trim().replace(/^v/i, '');
  // Take the leading numeric run only: everything from the first non-numeric
  // separator onwards is a pre-release tag or build metadata.
  const match = cleaned.match(/^\d+(?:\.\d+)*/);
  if (!match) return [0];
  return match[0].split('.').map((part) => Number.parseInt(part, 10) || 0);
}

/**
 * Compares two versions: negative if `a` is older, positive if newer, 0 equal.
 *
 * Missing components count as zero, so `2.1` equals `2.1.0` - which is what a
 * user expects, and what stops the check from reporting a difference that is
 * only formatting.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** True when `latest` is strictly newer than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(current, latest) < 0;
}

/**
 * Whether a tag names a pre-release.
 *
 * Used to label the update as a test build rather than hiding it: someone who
 * deliberately runs a beta wants to be told a newer beta exists, and someone on
 * stable should see that what is on offer is not stable.
 *
 * The keyword may be followed by a separator (`-beta.1`), a bare number
 * (`-rc1`) or nothing (`-beta`). It may not be followed by another letter, or
 * `0.4.0-betamax` would be read as a beta.
 */
export function isPrereleaseVersion(version: string): boolean {
  return /-(?:alpha|beta|rc|preview|next|canary)(?:[.\-\d]|$)/i.test(version.trim());
}

/**
 * Human-readable size, e.g. `18.4 MB`.
 *
 * Binary units, matching what a file manager reports for the same APK - a
 * decimal `MB` next to an OS showing `MiB` is the kind of mismatch that gets
 * reported as a bug.
 */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // One decimal, but only when it carries information: `18.4 MB` is worth the
  // extra digit, `42.0 MB` is not. Rounding to a whole number above ten (the
  // first attempt) threw away the `.4` on an 18 MB download.
  const rounded = Math.round(value * 10) / 10;
  return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + ' ' + units[unit];
}

/** How long to wait between silent checks: once a day. */
export const SILENT_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a silent check is due.
 *
 * A manual check (`silent === false`) is always due - the user pressed the
 * button, so throttling it would look like a broken button.
 */
export function shouldCheckNow(
  lastCheckTime: number | null | undefined,
  silent: boolean,
  now = Date.now(),
): boolean {
  if (!silent) return true;
  if (typeof lastCheckTime !== 'number' || !Number.isFinite(lastCheckTime) || lastCheckTime <= 0) {
    return true;
  }
  return now - lastCheckTime >= SILENT_CHECK_INTERVAL_MS;
}
