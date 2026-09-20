import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { checkForUpdate, type UpdateResult } from '@/utils/update';
import { formatBytes } from '@/utils/versionCompare';
import './update-capsule.css';

/**
 * The heads-up capsule that announces a new release.
 *
 * Checked once per app start from here rather than from the Settings page,
 * because the point is to reach someone who never opens Settings. The check is
 * silent and therefore throttled to once a day by `checkForUpdate`, so this
 * costs one request a day at most.
 *
 * Dismissal is remembered per version: closing it for 0.4.4 must not suppress
 * the announcement for 0.4.5. A prompt that reappears after being dismissed is
 * the fastest way to make people ignore it.
 */
const DISMISSED_KEY = 'aurora.update.dismissed';

function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISSED_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberDismissed(version: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, version);
  } catch {
    /* private mode - it simply reappears next launch */
  }
}

export function UpdateCapsule() {
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [dismissed, setDismissed] = useState(() => readDismissed());
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let alive = true;
    void checkForUpdate({ silent: true }).then((next) => {
      if (alive && next) setResult(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const latest = result?.latest;
  const version = latest?.latestVersion ?? '';
  const visible = Boolean(result?.hasUpdate && latest && version && version !== dismissed);

  /**
   * Hands the download to the OS.
   *
   * The same two-runtime split as everywhere else: a Tauri webview drops a
   * plain link, so the packaged app goes through the opener plugin while the
   * browser uses an anchor.
   */
  const startDownload = async () => {
    if (!latest || downloading) return;
    setDownloading(true);
    const url = latest.downloadUrl;
    try {
      const { isTauri } = await import('@/lib/apiTransport');
      if (isTauri()) {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(url);
        return;
      }
    } catch {
      /* fall through to the browser path */
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.rel = 'noopener noreferrer';
    anchor.download = '';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  if (!visible || !latest) return null;

  const size = formatBytes(latest.size);

  return (
    <div className="update-capsule" role="status">
      <button className="update-capsule__main" onClick={() => void startDownload()}>
        <span className="update-capsule__icon">
          <Icon name="download" size={16} />
        </span>
        <span className="update-capsule__text">
          <span className="update-capsule__title">
            新版本 {version}
            {latest.prerelease ? <span className="update-capsule__badge">测试版</span> : null}
          </span>
          <span className="update-capsule__desc">
            {downloading ? '正在打开下载…' : size ? '点击下载 · ' + size : '点击下载'}
          </span>
        </span>
        <Icon name="chevronRight" size={16} className="update-capsule__chevron" />
      </button>

      <button
        className="update-capsule__close"
        aria-label="忽略此版本"
        onClick={() => {
          rememberDismissed(version);
          setDismissed(version);
        }}
      >
        <Icon name="close" size={15} />
      </button>
    </div>
  );
}
