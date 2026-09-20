/**
 * FlymeMusic official landing page entry.
 * Plain TypeScript — no framework. Imports the app's design tokens
 * (global.css) plus landing-specific styles, then wires up the
 * scroll-reveal animation driven by IntersectionObserver.
 */
import '../styles/global.css';
import './official.css';
import { initDownload } from './download';

function initReveal(): void {
  const targets = document.querySelectorAll<HTMLElement>('.of-reveal');
  if (!targets.length) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('of-reveal--visible'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        // Stagger siblings inside the same grid (feature cards).
        const siblings = el.parentElement
          ? Array.from(el.parentElement.children).filter((c) => c.classList.contains('of-reveal'))
          : [el];
        const index = Math.max(0, siblings.indexOf(el));
        el.style.transitionDelay = `${Math.min(index, 5) * 60}ms`;
        el.classList.add('of-reveal--visible');
        io.unobserve(el);
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
  );

  targets.forEach((el) => io.observe(el));
}

initReveal();

initDownload();
