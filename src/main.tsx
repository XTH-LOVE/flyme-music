import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { App } from '@/app/App';
import { isTauri } from '@/lib/apiTransport';
import '@/styles/global.css';
import '@/components/cover-fix.css';

/** Packaged app uses hash routing (local protocol has no history fallback); web retains history mode. */
const Router = isTauri() ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </Router>
  </StrictMode>,
);

/**
 * Tag background failures so they are findable.
 *
 * A lot of this app is fire-and-forget: artwork resolution, source searches,
 * offline caching. The browser already reports an unhandled rejection, but
 * nothing in that report says it came from us - during the cover and search
 * investigations it was genuinely hard to tell a real failure from an unrelated
 * extension's noise. One greppable prefix fixes that; the default logging is
 * left in place rather than swallowed.
 */
window.addEventListener('unhandledrejection', (event) => {
  console.warn('[aurora] unhandled rejection:', event.reason);
});

/**
 * Service Worker update detection: when a new deployment activates, the old
 * page may still reference JS chunks that no longer exist (content-hashed).
 * Reloading immediately ensures the new shell and its chunk map are used.
 */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

// Dev-only debug handle: lets the console inspect playback state and the
// Web Audio wiring without exposing anything in production builds.
if (import.meta.env.DEV) {
  void (async () => {
    const { playerController } = await import('@/player');
    const { isWired } = await import('@/player/webAudio');
    (window as unknown as Record<string, unknown>).__aurora = { playerController, isWired };
  })();
}
