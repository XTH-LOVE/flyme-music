/**
 * The update check, client side.
 *
 * Talks to our own `/api/update/check`, never to GitHub - see the function's
 * header for why. The rules that decide whether the answer is trustworthy are
 * in `versionCompare`; this file is only transport and the "which version am I"
 * question.
 */

import { httpFetch, isTauri } from '@/lib/apiTransport';
import { compareVersions, isNewerVersion, shouldCheckNow } from './versionCompare';

/** Injected by Vite from package.json. See `define` in vite.config.ts. */
declare const __APP_VERSION__: string;

/**
 * The deployed backend, used only by the packaged app.
 *
 * The web build can ask for a relative `/api/update/check` because it is served
 * from the same origin as the functions. The packaged app is not: its webview
 * origin is `tauri.localhost`, so the relative path resolves to a local address
 * that has no such route and the check silently fails. `httpFetch` documents
 * the same constraint, which is why it rejects relative input outright.
 *
 * The request is allowed through the backend's origin guard because
 * `apiGuard` whitelists the Tauri webview origins by name.
 */
const BACKEND_ORIGIN = 'https://flyme-music.pages.dev';

export interface UpdateInfo {
  latestVersion: string;
  changelog: string;
  downloadUrl: string;
  directUrl: string;
  publishDate: string;
  size: number;
  prerelease: boolean;
}

export interface UpdateResult {
  currentVersion: string;
  latest: UpdateInfo | null;
  hasUpdate: boolean;
  /** Why there is no answer, when there is none. */
  reason?: 'no_release' | 'no_apk' | 'unreachable' | 'offline' | 'not_configured';
}

/**
 * The version this build is running.
 *
 * Two sources, because they disagree after an update: the packaged app knows
 * its own version from the bundle, while a web page only knows the version it
 * was built with. Using one for both would make an updated app report the
 * previous number - and then offer an update it has already installed.
 */
export async function currentVersion(): Promise<string> {
  try {
    const { isTauri } = await import('@/lib/apiTransport');
    if (isTauri()) {
      const { getVersion } = await import('@tauri-apps/api/app');
      const version = await getVersion();
      if (version) return version;
    }
  } catch {
    // Not packaged, or the API is unavailable: the build constant is correct.
  }
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
}

/**
 * Asks the backend for the latest release.
 *
 * Returns a `reason` instead of throwing, because every failure here has a
 * different thing to say to the user and none of them is an exception:
 * "no release published yet" is normal on a fresh repository, and "could not
 * reach the server" must not be shown as "you are up to date".
 */
export async function fetchLatest(signal?: AbortSignal): Promise<UpdateResult> {
  const version = await currentVersion();

  // Absolute in the packaged app, relative in the browser - see BACKEND_ORIGIN.
  const path = '/api/update/check';
  let response: Response;
  try {
    response = await httpFetch(isTauri() ? BACKEND_ORIGIN + path : path, {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch {
    return { currentVersion: version, latest: null, hasUpdate: false, reason: 'offline' };
  }

  if (response.status === 404) {
    // No release, or a release with no APK for this platform.
    const body = await response.json().catch(() => ({}));
    const reason = (body as { error?: string }).error === 'no_apk' ? 'no_apk' : 'no_release';
    return { currentVersion: version, latest: null, hasUpdate: false, reason };
  }

  if (!response.ok) {
    // A misconfigured server says so explicitly, and repeating it as "check
    // failed, try again later" sends the user into a retry loop that cannot
    // succeed. The distinction is worth the extra branch.
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    const reason = /GITHUB_REPO/i.test(body.error ?? '') ? 'not_configured' : 'unreachable';
    return { currentVersion: version, latest: null, hasUpdate: false, reason };
  }

  const latest = (await response.json()) as UpdateInfo;
  if (!latest?.latestVersion) {
    return { currentVersion: version, latest: null, hasUpdate: false, reason: 'no_release' };
  }

  return {
    currentVersion: version,
    latest,
    hasUpdate: isNewerVersion(latest.latestVersion, version),
  };
}

const LAST_CHECK_KEY = 'aurora.update.lastCheck';
const LAST_RESULT_KEY = 'aurora.update.lastResult';

function readLastCheck(): number {
  try {
    const raw = Number(localStorage.getItem(LAST_CHECK_KEY));
    return Number.isFinite(raw) ? raw : 0;
  } catch {
    return 0;
  }
}

function writeLastCheck(at: number): void {
  try {
    localStorage.setItem(LAST_CHECK_KEY, String(at));
  } catch {
    /* private mode - the throttle simply does not persist */
  }
}

/**
 * The previous answer, kept so a throttled check can still say something.
 *
 * The throttle used to return null, which meant the update capsule - whose only
 * check is the throttled one - showed nothing at all once anything else had
 * checked that day. A release could sit unnoticed until the next day, and if
 * the About screen had been opened first, until the day after that.
 *
 * The throttle exists to avoid hammering the network, not to hide the answer
 * from the interface. Caching it keeps the request count identical and makes
 * the result available to everything that asks.
 */
function readLastResult(): UpdateResult | null {
  try {
    const raw = localStorage.getItem(LAST_RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UpdateResult;
    return parsed && typeof parsed === 'object' && 'hasUpdate' in parsed ? parsed : null;
  } catch {
    return null;
  }
}

function writeLastResult(result: UpdateResult): void {
  try {
    localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result));
  } catch {
    /* private mode - the capsule simply will not have a cached answer */
  }
}

/**
 * The update check, with the once-a-day silent throttle.
 *
 * `silent` is what the app calls on launch; the About screen calls it with
 * `silent: false` so a manual tap always does something. Throttling the manual
 * path too would make the button look broken.
 */
export async function checkForUpdate(options: { silent?: boolean; signal?: AbortSignal } = {}): Promise<
  UpdateResult | null
> {
  const silent = options.silent ?? false;
  if (!shouldCheckNow(readLastCheck(), silent)) {
    // Throttled, but not silent about what was already known.
    return readLastResult();
  }

  const result = await fetchLatest(options.signal);
  // Recorded even on failure: a retry loop against an unreachable server is
  // worse than waiting a day.
  writeLastCheck(Date.now());
  writeLastResult(result);
  return result;
}

/** One line for the About row. */
export function describeUpdate(result: UpdateResult): string {
  if (result.hasUpdate && result.latest) {
    return '新版本 ' + result.latest.latestVersion;
  }
  switch (result.reason) {
    case 'offline':
      return '网络不可用';
    case 'unreachable':
      return '检查失败，稍后再试';
    case 'not_configured':
      // Named plainly rather than softened: this is an operator problem, not
      // something the person tapping the button can fix by trying again.
      return '更新服务未配置';
    case 'no_apk':
      return '当前平台暂无安装包';
    case 'no_release':
      return '暂无发布版本';
    default:
      return '已是最新版本（' + result.currentVersion + '）';
  }
}

export { compareVersions };
