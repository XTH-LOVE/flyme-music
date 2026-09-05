import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useAiStore, aiConfigured, nextAiMsgId } from '@/store/useAiStore';
import { notify } from '@/utils/notify';
import {
  generateProactive,
  djTrigger,
  markFired,
  milestoneTrigger,
  mountTriggers,
  trackSession,
  type ProactiveKind,
  type SessionState,
} from './proactive';

/**
 * Headless proactive companion: greets once a day, reacts to listening
 * milestones and writes the weekly report into the listen-together
 * timeline. Everything is gated locally (see proactive.ts) and silently
 * degrades to template copy when AI is unavailable.
 */
export function ProactiveEngine() {
  const proactive = useAiStore((s) => s.proactive);
  const model = useAiStore((s) => s.model);
  const persona = useAiStore((s) => s.persona);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const push = (
      kind: ProactiveKind,
      variant: string,
      playLog: ReturnType<typeof useLibraryStore.getState>['playLog'],
      session: SessionState | null = null,
    ) => {
      const state = useAiStore.getState();
      void generateProactive(kind, {
        persona: state.persona,
        model: state.model,
        aiReady: state.companion && aiConfigured({ model: state.model }),
        memories: state.memories,
        playLog,
        session,
      }).then(({ text }) => {
        state.pushMessage({ id: nextAiMsgId(), role: 'ai', kind: 'chat', text });
        if (kind === 'weekly') notify('Aurora 为你生成了上周听歌报告');
        markFired(kind, variant, Date.now());
      });
    };

    // Mount-time triggers: daily greeting + weekly report.
    const kinds = mountTriggers(Date.now(), proactive);
    const playLog = useLibraryStore.getState().playLog;
    for (const kind of kinds) {
      push(kind, kind, playLog);
    }

    // Milestone trigger rides on track changes.
    const player = usePlayerStore.getState();
    const key = player.current ? player.current.source + ':' + player.current.id : null;
    lastKey.current = key;
    const unsubscribe = usePlayerStore.subscribe((s) => {
      const next = s.current ? s.current.source + ':' + s.current.id : null;
      if (next === lastKey.current) return;
      lastKey.current = next;
      if (!next || !s.current) return;
      const session = trackSession(s.current.artist[0] ?? null, Date.now());
      if (djTrigger(Date.now(), proactive)) {
        // DJ interlude rides on the session counter (every DJ_EVERY_SONGS tracks).
        push('dj', 'dj', useLibraryStore.getState().playLog, session);
        return;
      }
      if (milestoneTrigger(Date.now(), proactive, useLibraryStore.getState().playLog)) {
        const variant = (Date.now() - session.startedAt) / 60_000 >= 60 ? 'milestone:minutes' : 'milestone:artist';
        push('milestone', variant, useLibraryStore.getState().playLog, session);
      }
    });
    return unsubscribe;
  }, [proactive, model, persona]);

  return null;
}
