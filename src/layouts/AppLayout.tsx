import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MiniPlayer } from '@/components/MiniPlayer';
import { BottomNavigation } from '@/components/BottomNavigation';
import { PageBackButton } from '@/components/PageBackButton';
import { FullPlayer } from '@/components/player/FullPlayer';
import { AiCompanion } from '@/components/ai/AiCompanion';
import { ProactiveEngine } from '@/ai/ProactiveEngine';
import { MonetAccent } from '@/components/MonetAccent';
import { usePlaybackSync } from '@/hooks/usePlaybackSync';
import { useMediaSession } from '@/hooks/useMediaSession';
import { useSleepTimer } from '@/hooks/useSleepTimer';
import { usePrefetch } from '@/hooks/usePrefetch';
import { getAiStatus } from '@/ai/aiClient';
import { useAiStore } from '@/store/useAiStore';
import './layout.css';
import { registerAppNavigation } from '@/app/navigation';
import { startLibrarySync } from '@/sync/librarySync';
import { useListenRoom } from '@/hooks/useListenRoom';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useEffect } from 'react';

export function AppLayout() {
  usePlaybackSync();
  useMediaSession();
  useSleepTimer();
  usePrefetch();
  useListenRoom();
  useKeyboardShortcuts();
  useEffect(() => {
    startLibrarySync();
    let unlistenMedia: (() => void) | null = null;
    let unlistenBack: (() => void) | null = null;
    // Guards against the async mount resolving *after* cleanup already ran
    // (StrictMode double-invoke, or a fast unmount): without this the Tauri
    // event listeners are never removed.
    let cancelled = false;
    // Global media shortcuts only exist in the packaged app.
    void import('@/lib/globalMediaKeys').then((m) =>
      m.mountGlobalMediaKeys().then((unlisten) => {
        if (cancelled) unlisten();
        else unlistenMedia = unlisten;
      }),
    );
    // Android system back walks the router history instead of exiting.
    void import('@/lib/androidBack').then((m) =>
      m.mountAndroidBackNavigation().then((unlisten) => {
        if (cancelled) unlisten();
        else unlistenBack = unlisten;
      }),
    );
    return () => {
      cancelled = true;
      unlistenMedia?.();
      unlistenBack?.();
    };
  }, []);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => registerAppNavigation(navigate), [navigate]);
  useEffect(() => {
    let cancelled = false;
    void getAiStatus().then((status) => {
      const ai = useAiStore.getState();
      if (!cancelled && !ai.model.trim() && status.configured && status.model.trim()) {
        ai.setConfig({ model: status.model });
      }
    }).catch(() => {
      // AI is optional; its own UI surfaces connection failures when used.
    });
    return () => { cancelled = true; };
  }, []);
  return (
    <div className="app-shell">
      <MonetAccent />
      <Sidebar />
      <main className="app-main">
        <div key={location.pathname} className="app-main__inner am-page-enter">
          <PageBackButton />
          <Outlet />
        </div>
      </main>
      <MiniPlayer />
      <BottomNavigation />
      <AiCompanion />
      <ProactiveEngine />
      <FullPlayer />
    </div>
  );
}
