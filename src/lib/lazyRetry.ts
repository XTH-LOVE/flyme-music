import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'am.chunk.reload';

/**
 * Route-level lazy import that survives deployments. When a new version is
 * deployed, an already-open tab holds stale chunk hashes and the dynamic
 * import fails (the old file may be gone or the edge served a mixed state).
 * Reloading the page once picks up the fresh index with new hashes; the
 * sessionStorage flag prevents reload loops when the failure is genuine
 * (e.g. offline).
 */
export function lazyRetry(load: () => Promise<{ default: ComponentType<unknown> }>) {
  return lazy(async () => {
    const alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === '1';
    try {
      const mod = await load();
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (error) {
      if (alreadyReloaded) throw error;
      sessionStorage.setItem(RELOAD_KEY, '1');
      window.location.reload();
      return { default: () => null };
    }
  });
}
