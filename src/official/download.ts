/**
 * Fills the landing page's download section from the release API.
 *
 * Fetched in the browser rather than baked in at build time: a release
 * published on GitHub then shows up here as soon as the API's ten-minute edge
 * cache expires, instead of requiring the landing page to be rebuilt and
 * redeployed for every version.
 *
 * The page is served from the same origin as the API, so it passes the same
 * origin check that the packaged app does - no separate allowance is needed.
 */

interface UpdateInfo {
  latestVersion: string;
  changelog: string;
  downloadUrl: string;
  directUrl: string;
  publishDate: string;
  size: number;
  prerelease: boolean;
}

/** Where to send someone when the API cannot answer at all. */
const RELEASES_PAGE = 'https://github.com/XTH-LOVE/flyme-music/releases/latest';

function formatBytes(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = Math.round(value * 10) / 10;
  return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + ' ' + units[unit];
}

function formatDate(iso: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

/**
 * Sets a link's href, or removes the link entirely when there is no URL.
 *
 * Removing rather than leaving a dead `href="#"` matters: a download button
 * that does nothing is worse than one that is not there, because the visitor
 * concludes the download is broken rather than that the build is unavailable.
 */
function setLink(el: HTMLAnchorElement | null, url: string | undefined): boolean {
  if (!el) return false;
  if (!url) {
    el.remove();
    return false;
  }
  el.href = url;
  return true;
}

export function initDownload(): void {
  const section = document.getElementById('download');
  if (!section) return;

  const status = section.querySelector<HTMLElement>('[data-dl="status"]');
  const meta = section.querySelector<HTMLElement>('[data-dl="meta"]');
  const log = section.querySelector<HTMLElement>('[data-dl="log"]');
  const proxyLink = section.querySelector<HTMLAnchorElement>('[data-dl="proxy"]');
  const directLink = section.querySelector<HTMLAnchorElement>('[data-dl="direct"]');
  const fallback = section.querySelector<HTMLAnchorElement>('[data-dl="fallback"]');

  fetch('/api/update/check', { headers: { Accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return (await response.json()) as UpdateInfo;
    })
    .then((info) => {
      if (!info?.latestVersion) throw new Error('empty');

      if (status) status.textContent = info.latestVersion;

      // The hero strip stays hidden until there is something true to put in
      // it, rather than showing a row of dashes.
      const put = (key: string, value: string | null) => {
        const el = document.querySelector<HTMLElement>('[data-dl="' + key + '"]');
        if (el && value) el.textContent = value;
      };
      put('stat-version', info.latestVersion);
      put('stat-size', formatBytes(info.size));
      put('stat-date', formatDate(info.publishDate));
      const stats = document.querySelector<HTMLElement>('[data-dl="stats"]');
      if (stats) stats.hidden = false;
      if (meta) {
        const parts = [formatDate(info.publishDate), formatBytes(info.size)].filter(Boolean);
        meta.textContent = parts.join(' · ');
      }
      if (log && info.changelog) {
        log.textContent = info.changelog;
        log.hidden = false;
      }
      if (info.prerelease && status) {
        // A test build offered without saying so is how someone ends up on one
        // without choosing it.
        const badge = document.createElement('span');
        badge.className = 'of-download__badge';
        badge.textContent = '测试版';
        status.after(badge);
      }

      setLink(proxyLink, info.downloadUrl);
      setLink(directLink, info.directUrl);
      if (fallback) fallback.remove();
    })
    .catch(() => {
      // The API could not answer. Leave a link to the releases page rather than
      // an empty section, so the visitor can still get the app.
      if (status) status.textContent = '最新版本';
      if (meta) meta.textContent = '暂时无法获取版本信息，可前往 GitHub 查看';
      if (proxyLink) proxyLink.remove();
      if (fallback) {
        fallback.href = RELEASES_PAGE;
        fallback.hidden = false;
      }
    });
}
