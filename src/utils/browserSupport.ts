/**
 * Whether this browser can render the app.
 *
 * The app is built on a handful of CSS features that older engines do not have,
 * and an unsupported declaration is not a degraded result - it is a dropped
 * one. `aspect-ratio` missing means every cover has zero height; flex `gap`
 * missing means every row of controls is welded together. The user sees a
 * broken page with no explanation, which is what a report of "there are no
 * covers and everything overlaps" actually is.
 *
 * So the browser is asked directly, before anything renders, rather than
 * inferred from a user-agent string - `CSS.supports` answers the real question
 * and does not need updating when a new engine appears.
 *
 * The list is deliberately short: only the features whose absence breaks the
 * layout rather than merely changing it. `color-mix` is left out on purpose -
 * without it a shadow is missing, which nobody has ever reported as a bug.
 */

export interface SupportReport {
  ok: boolean;
  /** Human-readable names of what is missing, for the message. */
  missing: string[];
}

interface Check {
  name: string;
  test: string;
}

const CHECKS: Check[] = [
  { name: '圆角封面', test: 'aspect-ratio: 1 / 1' },
  { name: '元素间距', test: 'display: flex; gap: 1px' },
  { name: '自适应高度', test: 'height: 1dvh' },
];

export function checkBrowserSupport(): SupportReport {
  // No `CSS` at all means something far older than anything the checks below
  // describe, and every one of them would fail anyway.
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
    return { ok: false, missing: CHECKS.map((c) => c.name) };
  }
  const missing = CHECKS.filter((check) => !CSS.supports(check.test)).map((c) => c.name);
  return { ok: missing.length === 0, missing };
}
