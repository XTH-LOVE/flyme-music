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

// Dev-only debug handle: lets the console inspect playback state and the
// Web Audio wiring without exposing anything in production builds.
if (import.meta.env.DEV) {
  void (async () => {
    const { playerController } = await import('@/player');
    const { isWired } = await import('@/player/webAudio');
    (window as unknown as Record<string, unknown>).__aurora = { playerController, isWired };
  })();
}
