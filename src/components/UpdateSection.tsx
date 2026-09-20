import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { checkForUpdate, currentVersion, describeUpdate, type UpdateResult } from '@/utils/update';
import { formatBytes, isPrereleaseVersion } from '@/utils/versionCompare';
import './update-section.css';

/**
 * The About card's version row and its update panel.
 *
 * Deliberately a single component rather than rows wired into the settings page
 * directly: everything here depends on one piece of state (the last check
 * result), and splitting the row from the panel would mean lifting that state
 * into the page for no benefit.
 *
 * The check on mount is silent, so opening Settings does not fire a request
 * every time - `checkForUpdate` throttles it to once a day and returns null when
 * it is not due. Pressing the button always checks.
 */
export function UpdateSection() {
  // Resolved here rather than passed in: the packaged app reports the version
  // the OS knows, which the caller cannot see, so threading it through a prop
  // would mean every caller getting it wrong.
  const [version, setVersion] = useState('');
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    void currentVersion().then((value) => {
      if (alive.current) setVersion(value);
    });
  }, []);

  // Silent: fires at most once a day, and does nothing at all when it is not
  // due. A result that arrives after the user navigated away is dropped rather
  // than set on an unmounted component.
  useEffect(() => {
    void checkForUpdate({ silent: true }).then((next) => {
      if (alive.current && next) setResult(next);
    });
  }, []);

  const runCheck = async () => {
    if (busy) return;
    setBusy(true);
    setOpen(true);
    try {
      const next = await checkForUpdate({ silent: false });
      if (alive.current && next) setResult(next);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const latest = result?.latest ?? null;
  const hasUpdate = Boolean(result?.hasUpdate);
  const status = busy ? '正在检查…' : result ? describeUpdate(result) : '版本 ' + version;

  /**
   * Starts the download by navigating to it.
   *
   * The route answers with `Content-Disposition: attachment`, so this downloads
   * rather than navigating away - which matters in the packaged app, where a
   * normal navigation would replace the app's own page with an APK.
   */
  const download = (url: string) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.rel = 'noopener noreferrer';
    anchor.download = '';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <>
      <div className="settings-row">
        <div className="settings-row__body">
          <div className="settings-row__title">Flyme Music</div>
          <div className="settings-row__desc">
            版本 {version || '…'} · HyperOS 风格现代音乐播放器 · Flyme AI 伴侣
          </div>
        </div>
        <button
          className={'am-btn am-btn--sm ' + (hasUpdate ? 'am-btn--primary' : 'am-btn--ghost')}
          onClick={() => void runCheck()}
          disabled={busy}
        >
          {busy ? (
            <Icon name="refresh" size={14} className="update-section__spin" />
          ) : (
            <Icon name="refresh" size={14} />
          )}
          {hasUpdate ? '有新版本' : '检查更新'}
        </button>
      </div>

      {open ? (
        <div className="update-panel">
          <div className="update-panel__head">
            <span className="update-panel__status">{status}</span>
            {latest?.publishDate ? (
              <span className="update-panel__meta">{latest.publishDate.slice(0, 10)}</span>
            ) : null}
          </div>

          {hasUpdate && latest ? (
            <>
              <div className="update-panel__version">
                <span className="update-panel__tag">{latest.latestVersion}</span>
                {isPrereleaseVersion(latest.latestVersion) ? (
                  // Said out loud: a beta is not for everyone, and the version
                  // number alone does not reveal it.
                  <span className="update-panel__badge">测试版</span>
                ) : null}
                {latest.size > 0 ? (
                  <span className="update-panel__meta">{formatBytes(latest.size)}</span>
                ) : null}
              </div>

              {latest.changelog ? <pre className="update-panel__log">{latest.changelog}</pre> : null}

              <div className="update-panel__actions">
                {/* Two routes on purpose: the proxy is fast where GitHub is
                    slow, and the direct link is the fallback when it is not. */}
                <button className="am-btn am-btn--primary am-btn--sm" onClick={() => download(latest.downloadUrl)}>
                  <Icon name="download" size={14} />
                  国内加速下载
                </button>
                <button className="am-btn am-btn--secondary am-btn--sm" onClick={() => download(latest.directUrl)}>
                  <Icon name="download" size={14} />
                  从 GitHub 下载
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
