import { httpFetch } from '@/lib/apiTransport';

/**
 * Music API endpoint management with failure cooldown,
 * replicated from Otter Music's src/lib/api/config.ts.
 */
const REQUEST_TIMEOUT_MS = 10000;
const MUSIC_API_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;

export const DEFAULT_MUSIC_API_URL = 'https://music-api.gdstudio.xyz/api.php';

const STORAGE_KEY_MUSIC_URLS = 'aurora_music_api_urls';
const STORAGE_KEY_MUSIC_URL_FAILURES = 'aurora_music_api_url_failures';

function getStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setStorage(key: string, val: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore */
  }
}

export const getMusicApiUrls = (): string[] => {
  const stored = getStorage<string[] | null>(STORAGE_KEY_MUSIC_URLS, null);
  return stored ?? [DEFAULT_MUSIC_API_URL];
};

export const setMusicApiUrls = (urls: string[]): void =>
  setStorage(STORAGE_KEY_MUSIC_URLS, urls);

const getActiveFailures = (now = Date.now()): Record<string, number> => {
  const map = getStorage<Record<string, number>>(STORAGE_KEY_MUSIC_URL_FAILURES, {});
  Object.keys(map).forEach((url) => {
    if (map[url] <= now) delete map[url];
  });
  return map;
};

/** Healthy endpoints first, cooling-down ones last. Read-only: no write on read. */
export function getOrderedMusicApiUrls(now = Date.now()): string[] {
  const urls = getMusicApiUrls();
  const fails = getActiveFailures(now);
  return [...urls.filter((url) => !fails[url]), ...urls.filter((url) => fails[url])];
}

export const markMusicApiUrlFailure = (url: string, now = Date.now()): void =>
  setStorage(STORAGE_KEY_MUSIC_URL_FAILURES, {
    ...getActiveFailures(now),
    [url]: now + MUSIC_API_FAILURE_COOLDOWN_MS,
  });

export const markMusicApiUrlSuccess = (url: string, now = Date.now()): void => {
  const fails = getActiveFailures(now);
  if (fails[url]) {
    delete fails[url];
    setStorage(STORAGE_KEY_MUSIC_URL_FAILURES, fails);
  }
};

export function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeout = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  // Merge (not overwrite) the caller's signal: aborting either source
  // cancels the request.
  const external = init.signal;
  const forwardAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', forwardAbort);
  }
  const timer = window.setTimeout(() => controller.abort(), timeout);
  return httpFetch(input, { ...init, signal: controller.signal }).finally(() => {
    window.clearTimeout(timer);
    if (external) external.removeEventListener('abort', forwardAbort);
  });
}
