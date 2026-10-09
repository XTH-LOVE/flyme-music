/**
 * Fills the landing page's Android download view from the release API.
 *
 * The markup only knows where the buttons and facts are. The concrete APK URL
 * is not written into the page: `releases/latest/download/...` looks stable,
 * but GitHub answers it with a redirect, and the China download proxy only
 * accepts a concrete release-asset URL. Asking `/api/update/check` returns
 * that URL already wrapped in the proxy, plus the version, size and date.
 *
 * Fetched in the browser rather than baked in at build time, so a release
 * shows up here as soon as the API's edge cache expires.
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
 * Points a link at a URL, or removes it when there is nothing to point at.
 *
 * A download button that does nothing is worse than one that is not there:
 * the visitor concludes the download is broken rather than unavailable.
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

function setText(selector: string, value: string | null): void {
  if (!value) return;
  document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    el.textContent = value;
  });
}

export function initDownload(): void {
  const proxyLink = document.querySelector<HTMLAnchorElement>('[data-dl="proxy"]');
  const directLink = document.querySelector<HTMLAnchorElement>('[data-dl="direct"]');
  const fallback = document.querySelector<HTMLAnchorElement>('[data-dl="fallback"]');
  const status = document.querySelector<HTMLElement>('[data-dl="status"]');
  const meta = document.querySelector<HTMLElement>('[data-dl="meta"]');
  const log = document.querySelector<HTMLElement>('[data-dl="log"]');

  fetch('/api/update/check', { headers: { Accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return (await response.json()) as UpdateInfo;
    })
    .then((info) => {
      if (!info?.latestVersion) throw new Error('empty');

      if (status) status.textContent = info.latestVersion;
      setText('[data-dl="stat-version"]', info.latestVersion);
      setText('[data-dl="stat-size"]', formatBytes(info.size));
      setText('[data-dl="stat-date"]', formatDate(info.publishDate));

      if (meta) {
        const parts = [formatDate(info.publishDate), formatBytes(info.size)].filter(Boolean);
        meta.textContent = parts.join(' · ');
      }
      if (log && info.changelog) {
        log.textContent = info.changelog;
        log.hidden = false;
      }
      if (info.prerelease && status) {
        const badge = document.createElement('span');
        badge.className = 'dl-badge';
        badge.textContent = '测试版';
        status.after(badge);
      }

      // The proxy URL is the China path. The direct URL stays as the
      // fallback for anyone the proxy cannot reach.
      setLink(proxyLink, info.downloadUrl);
      setLink(directLink, info.directUrl);
      if (fallback) fallback.remove();
    })
    .catch(() => {
      if (status) status.textContent = '最新版本';
      if (meta) meta.textContent = '暂时无法获取版本信息，可前往 GitHub 查看';
      if (proxyLink) proxyLink.remove();
      if (directLink) directLink.remove();
      if (fallback) {
        fallback.href = RELEASES_PAGE;
        fallback.hidden = false;
      }
    });
}
