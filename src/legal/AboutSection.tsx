import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { UpdateSection } from '@/components/UpdateSection';
import { LegalSection } from './LegalSection';
import { currentVersion } from '@/utils/update';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlaylistStore } from '@/store/usePlaylistStore';
import './legal.css';

/**
 * The author and the project's public destinations.
 *
 * Kept as constants rather than inlined so there is one place to change them -
 * a link that appears in three components is a link that gets updated in two.
 */
export const AUTHOR = '缐廷华';
export const AUTHOR_LINK = 'https://github.com/XTH-LOVE';
export const HOMEPAGE = 'https://flyme-music.pages.dev/official';
export const FEEDBACK_URL = 'https://github.com/XTH-LOVE/flyme-music/issues/new';

/**
 * The ICP filing number, shown only when it is set.
 *
 * Deliberately empty: a filing number is issued by the authority for a specific
 * domain, and printing a placeholder - or someone else's number - is worse than
 * printing nothing. Fill this in and the row appears; leave it and the row does
 * not, so the About card never carries a false statement.
 */
export const ICP_LICENSE = '';

/**
 * The About card.
 *
 * Composed rather than written as one block: the update row and the legal rows
 * already exist as their own components with their own state, and folding them
 * in here would mean lifting that state for no benefit.
 */
export function AboutSection() {
  const [version, setVersion] = useState('');
  const playLog = useLibraryStore((s) => s.playLog);
  const favorites = useLibraryStore((s) => s.favoriteSongIds);
  const playlists = usePlaylistStore((s) => s.playlists);

  useEffect(() => {
    void currentVersion().then(setVersion);
  }, []);

  const openExternal = (url: string) => {
    // Same two-runtime split as the update buttons: a Tauri webview drops a
    // plain link, so it has to go through the OS.
    void (async () => {
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
      window.open(url, '_blank', 'noopener,noreferrer');
    })();
  };

  return (
    <>
      <div className="about-hero">
        <img className="about-hero__mark" src="/flyme-mark.jpg" alt="" />
        <div className="about-hero__name">Flyme Music</div>
        <div className="about-hero__version">v{version || '…'}</div>
        <div className="about-hero__tagline">HyperOS 风格现代音乐播放器</div>
        <div className="about-hero__author">
          由 <span className="about-hero__author-name">{AUTHOR}</span> 设计与开发
        </div>
      </div>

      {/* Numbers rather than adjectives: "已播放 1,204 次" says more about the
          app than a sentence about how good it is. */}
      <div className="about-stats">
        <div className="about-stat">
          <div className="about-stat__value">{playLog.length.toLocaleString()}</div>
          <div className="about-stat__label">播放记录</div>
        </div>
        <div className="about-stat">
          <div className="about-stat__value">{favorites.length.toLocaleString()}</div>
          <div className="about-stat__label">收藏歌曲</div>
        </div>
        <div className="about-stat">
          <div className="about-stat__value">{playlists.length.toLocaleString()}</div>
          <div className="about-stat__label">自建歌单</div>
        </div>
      </div>

      <UpdateSection />
      <LegalSection />

      <button className="settings-row settings-row--button" onClick={() => openExternal(FEEDBACK_URL)}>
        <div className="settings-row__body">
          <div className="settings-row__title">意见反馈</div>
          <div className="settings-row__desc">遇到问题或有建议，欢迎在项目仓库提 issue</div>
        </div>
        <Icon name="chevronRight" size={18} className="legal-row__chevron" />
      </button>

      <button className="settings-row settings-row--button" onClick={() => openExternal(HOMEPAGE)}>
        <div className="settings-row__body">
          <div className="settings-row__title">官方网站</div>
          <div className="settings-row__desc">flyme-music.pages.dev</div>
        </div>
        <Icon name="chevronRight" size={18} className="legal-row__chevron" />
      </button>

      <button className="settings-row settings-row--button" onClick={() => openExternal(AUTHOR_LINK)}>
        <div className="settings-row__body">
          <div className="settings-row__title">开发者</div>
          <div className="settings-row__desc">{AUTHOR} · github.com/XTH-LOVE</div>
        </div>
        <Icon name="chevronRight" size={18} className="legal-row__chevron" />
      </button>

      {ICP_LICENSE ? (
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__desc about-icp">{ICP_LICENSE}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
