/**
 * FlymeMusic official landing page entry.
 *
 * The page is one self-contained document. This module only does what HTML
 * cannot: reveal sections on scroll, swap the product page for the download
 * view, and fill that view from the release API.
 */
import { initDownload } from './download';

function initReveal(): void {
  const targets = document.querySelectorAll<HTMLElement>('.reveal');
  if (!targets.length) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) return;

  document.documentElement.classList.add('motion-ready');
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -32px 0px' },
  );
  targets.forEach((el) => io.observe(el));
}

/** `#android-download` is a full-page view, not a section further down. */
function initDownloadView(): void {
  const home = document.querySelector<HTMLElement>('body > main:not(.download-page)');
  const downloadPage = document.querySelector<HTMLElement>('.download-page');
  const siteNav = document.querySelector<HTMLElement>('.nav');
  const siteFooter = document.querySelector<HTMLElement>('.footer');
  if (!home || !downloadPage) return;

  const defaultTitle = document.title;
  const sync = () => {
    const isDownload = window.location.hash === '#android-download';
    home.hidden = isDownload;
    if (siteNav) siteNav.hidden = isDownload;
    if (siteFooter) siteFooter.hidden = isDownload;
    downloadPage.hidden = !isDownload;
    document.title = isDownload ? '下载 Android 版 — Flyme Music' : defaultTitle;
    if (isDownload) window.scrollTo(0, 0);
  };

  window.addEventListener('hashchange', sync);
  sync();
}

initReveal();
initDownloadView();
initDownload();
