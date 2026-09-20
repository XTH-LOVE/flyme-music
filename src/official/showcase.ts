/**
 * The landing page's motion and live numbers.
 *
 * Three separate concerns that all happen to be "the page doing something":
 * a scroll progress bar, counters that count up, and the release timeline.
 * They live together because they share one fetch and one reduced-motion check.
 */

interface ReleaseSummary {
  version: string;
  title: string;
  date: string;
  prerelease: boolean;
  size: number;
  downloads: number;
  notes: string;
}

interface ShowcaseData {
  stars: number;
  forks: number;
  totalDownloads: number;
  releases: ReleaseSummary[];
}

/** Every animation here is decorative, so one flag turns them all off. */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A thin bar across the top that tracks scroll position.
 *
 * Driven by `scrollY` rather than an IntersectionObserver because the value is
 * continuous - there is no threshold to observe. The write happens inside a
 * rAF so a fast scroll cannot queue a style recalculation per event.
 */
export function initScrollProgress(): void {
  const bar = document.querySelector<HTMLElement>('[data-scroll-progress]');
  if (!bar) return;

  let queued = false;
  const update = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bar.style.transform = 'scaleX(' + ratio + ')';
  };

  window.addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  window.addEventListener('resize', update, { passive: true });
  update();
}

/**
 * Counts an element up to its value.
 *
 * Reads the target from `data-count-to` rather than parsing the text, so the
 * markup can show the final value for anyone with JavaScript disabled or motion
 * reduced - the number is correct before this ever runs.
 */
function animateCount(el: HTMLElement, to: number, durationMs: number): void {
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    // Ease-out cubic: fast at first, settling at the end, which reads as
    // "arriving at a number" rather than a linear ramp.
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(to * eased).toLocaleString();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function initCounters(): void {
  const targets = document.querySelectorAll<HTMLElement>('[data-count-to]');
  if (!targets.length) return;

  if (prefersReducedMotion() || !('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        const to = Number(el.dataset.countTo);
        if (Number.isFinite(to)) animateCount(el, to, 1100);
        io.unobserve(el);
      }
    },
    { threshold: 0.4 },
  );
  targets.forEach((el) => io.observe(el));
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function renderTimeline(releases: ReleaseSummary[]): void {
  const list = document.querySelector<HTMLElement>('[data-showcase="timeline"]');
  const empty = document.querySelector<HTMLElement>('[data-showcase="timeline-empty"]');
  if (!list) return;

  if (!releases.length) {
    if (empty) empty.hidden = false;
    return;
  }

  list.innerHTML = '';
  for (const release of releases) {
    const item = document.createElement('li');
    item.className = 'of-timeline__item' + (release.prerelease ? ' of-timeline__item--pre' : '');

    const version = document.createElement('span');
    version.className = 'of-timeline__version';
    version.textContent = release.version || release.title;
    if (release.prerelease) {
      const badge = document.createElement('span');
      badge.className = 'of-timeline__badge';
      badge.textContent = '测试版';
      version.appendChild(badge);
    }

    const date = document.createElement('span');
    date.className = 'of-timeline__date';
    date.textContent = release.date;

    const downloads = document.createElement('span');
    downloads.className = 'of-timeline__downloads';
    // Only shown when non-zero: "0 次下载" on a fresh release reads as failure
    // rather than as newness.
    downloads.textContent = release.downloads > 0 ? formatCount(release.downloads) + ' 次下载' : '';

    const head = document.createElement('div');
    head.className = 'of-timeline__head';
    head.append(version, date, downloads);

    // The first line of the note is enough to convey what a release was about;
    // the full text lives in the download card above.
    const firstLine = release.notes
      .split('\n')
      .map((line) => line.replace(/^[#\-*\s]+/, '').trim())
      .find((line) => line.length > 0);

    const summary = document.createElement('p');
    summary.className = 'of-timeline__notes';
    summary.textContent = firstLine ?? '';

    item.append(head, summary);
    list.appendChild(item);
  }
  if (empty) empty.hidden = true;
}

function fillCounters(data: ShowcaseData): void {
  const put = (key: string, value: number) => {
    const el = document.querySelector<HTMLElement>('[data-count-to="' + key + '"]');
    if (!el) return;
    el.dataset.countTo = String(value);
    // Pre-set the final value so the number is correct even if the observer
    // never fires (no JavaScript motion, or the section is never scrolled to).
    el.textContent = formatCount(value);
  };
  put('stars', data.stars);
  put('downloads', data.totalDownloads);

  const section = document.querySelector<HTMLElement>('[data-showcase="social"]');
  if (section && (data.stars > 0 || data.totalDownloads > 0)) section.hidden = false;

  // Start from zero only once the real numbers are in place, so the count-up
  // never runs from 0 to 0.
  initCounters();
}

export function initShowcase(): void {
  initScrollProgress();

  fetch('/api/update/releases', { headers: { Accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return (await response.json()) as ShowcaseData;
    })
    .then((data) => {
      renderTimeline(data.releases ?? []);
      fillCounters(data);
    })
    .catch(() => {
      // The page still works without this: the download card is served by a
      // separate request and the timeline simply stays empty.
      const empty = document.querySelector<HTMLElement>('[data-showcase="timeline-empty"]');
      if (empty) empty.hidden = false;
    });
}
