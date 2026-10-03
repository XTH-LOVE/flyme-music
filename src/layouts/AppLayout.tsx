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
import { useListenRoom } from '@/hooks/useListenRoom';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useBackgroundAnalysis } from '@/hooks/useBackgroundAnalysis';
import { useEffect } from 'react';
import { UpdateCapsule } from '@/components/UpdateCapsule';
import { AiCapsule } from '@/components/AiCapsule';
import { useMaterialYou } from '@/hooks/useMaterialYou';

export function AppLayout() {
  useMaterialYou();
  usePlaybackSync();
  useMediaSession();
  useSleepTimer();
  usePrefetch();
  useListenRoom();
  useKeyboardShortcuts();
  useBackgroundAnalysis();
  useEffect(() => {
    /*
     * Imported when the layout mounts, not at module scope.
     *
     * `librarySync` pulls in the Supabase client, which is about 58KB gzipped
     * and was being preloaded for every visitor - including the ones who never
     * sign in and therefore never reach a line of it. Nothing here needs it
     * before the first paint, so the import waits until after.
     */
    void import('@/sync/librarySync').then((m) => m.startLibrarySync());
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
      <UpdateCapsule />
      <AiCapsule />
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
