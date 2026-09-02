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
import { useSleepTimer } from '@/hooks/useSleepTimer';
import { usePrefetch } from '@/hooks/usePrefetch';
import { getAiStatus } from '@/ai/aiClient';
import { useAiStore } from '@/store/useAiStore';
import './layout.css';
import { registerAppNavigation } from '@/app/navigation';
import { useEffect } from 'react';

export function AppLayout() {
  usePlaybackSync();
  useSleepTimer();
  usePrefetch();
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
