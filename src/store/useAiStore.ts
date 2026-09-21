import { create } from 'zustand';
import type { MusicTrack } from '@/music/source/types';
import type { AiMemory } from '@/ai/memory';

export type AiPersona = 'gentle' | 'sharp' | 'chuuni';

export interface AiPlaylistInfo {
  id: string;
  name: string;
  tracks: MusicTrack[];
}

export interface AiMessage {
  id: string;
  role: 'user' | 'ai';
  /** 'chat' bubble, 'song' = timeline now-playing card. */
  kind?: 'chat' | 'song';
  text: string;
  tracks?: MusicTrack[];
  playlist?: AiPlaylistInfo;
  /** executed agent actions shown as chips above the text */
  steps?: string[];
  streaming?: boolean;
  error?: boolean;
  analysisStatus?: 'pending' | 'ready' | 'error' | 'skipped';
  /** User-facing analysis progress summary, never raw hidden chain-of-thought. */
  thought?: string;
  /**
   * Measured section boundaries for the message's track, when it was analysed.
   *
   * Kept on the message so the commentary can offer a jump: the analysis knows
   * where the chorus starts, and a number in prose is something the user has to
   * act on themselves. Deliberately the measured subset - no invented labels.
   */
  sections?: Array<{
    startSec: number;
    endSec: number;
    isLoudest: boolean;
    likelyChorus: boolean;
  }>;
  ts?: number;
}

interface AiConfigState {
  model: string;
  persona: AiPersona;
  companion: boolean;
  /**
   * Whether the floating AI pill is shown.
   *
   * Off by default, unlike every other switch here. It floats over the content
   * and the content is the point - a feature that announces itself is worth
   * less than the view it covers. People who want it will find it in Settings.
   */
  capsule: boolean;
  proactive: boolean;
}

interface AiState extends AiConfigState {
  busy: boolean;
  activity: string;
  analysisRetry: number;
  messages: AiMessage[];
  /** Negative-feedback artists/keywords the user told Flyme to avoid. */
  dislikes: string[];
  setConfig: (patch: Partial<AiConfigState>) => void;
  setBusy: (v: boolean) => void;
  setActivity: (v: string) => void;
  pushMessage: (m: AiMessage) => void;
  updateMessage: (id: string, patch: Partial<AiMessage>) => void;
  clearMessages: () => void;
  retryAnalysis: () => void;
  addDislike: (word: string) => void;
  clearDislikes: () => void;
  memories: AiMemory[];
  memoryPanelOpen: boolean;
  setMemories: (list: AiMemory[]) => void;
  setMemoryPanelOpen: (v: boolean) => void;
}

function loadConfig(): AiConfigState {
  try {
    const raw = localStorage.getItem('aurora.ai.v1');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiConfigState> & { apiKey?: unknown; endpoint?: unknown };
      const clean: AiConfigState = {
        model: '',
        persona: 'gentle',
        companion: true,
        capsule: false,
        proactive: true,
        ...(typeof parsed.model === 'string' ? { model: parsed.model } : {}),
        ...(parsed.persona === 'gentle' || parsed.persona === 'sharp' || parsed.persona === 'chuuni'
          ? { persona: parsed.persona }
          : {}),
        ...(typeof parsed.companion === 'boolean' ? { companion: parsed.companion } : {}),
        ...(typeof parsed.capsule === 'boolean' ? { capsule: parsed.capsule } : {}),
        ...(typeof parsed.proactive === 'boolean' ? { proactive: parsed.proactive } : {}),
      };
      if ('apiKey' in parsed || 'endpoint' in parsed) {
        localStorage.setItem('aurora.ai.v1', JSON.stringify(clean));
      }
      return clean;
    }
  } catch {
    /* ignore */
  }
  return { model: '', persona: 'gentle', companion: true, capsule: false, proactive: true };
}

function loadDislikes(): string[] {
  try {
    const raw = localStorage.getItem('aurora.ai.dislikes');
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

let msgSeq = 0;
export const nextAiMsgId = () => 'm' + Date.now().toString(36) + '-' + (msgSeq++);

export const useAiStore = create<AiState>((set, get) => ({
  ...loadConfig(),
  busy: false,
  activity: '',
  analysisRetry: 0,
  messages: [],
  dislikes: loadDislikes(),
  memories: [],
  memoryPanelOpen: false,
  proactive: true,

  setConfig: (patch) => {
    const next = { ...get(), ...patch };
    const persist: AiConfigState = {
      model: next.model,
      persona: next.persona,
      companion: next.companion,
      capsule: next.capsule,
      proactive: next.proactive,
    };
    try {
      localStorage.setItem('aurora.ai.v1', JSON.stringify(persist));
    } catch {
      /* ignore */
    }
    set(patch);
  },

  setBusy: (v) => set({ busy: v }),
  setActivity: (activity) => set({ activity }),
  pushMessage: (m) =>
    set((s) => ({ messages: [...s.messages, { ts: Date.now(), ...m }].slice(-80) })),
  updateMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  clearMessages: () => set({ messages: [] }),
  retryAnalysis: () => set((s) => ({ analysisRetry: s.analysisRetry + 1 })),

  addDislike: (word) => {
    const w = word.trim();
    if (!w) return;
    const next = Array.from(new Set([...get().dislikes, w])).slice(-30);
    try {
      localStorage.setItem('aurora.ai.dislikes', JSON.stringify(next));
    } catch {
      /* ignore */
    }
    set({ dislikes: next });
  },
  clearDislikes: () => {
    try {
      localStorage.setItem('aurora.ai.dislikes', '[]');
    } catch {
      /* ignore */
    }
    set({ dislikes: [] });
  },
  setMemories: (memories) => set({ memories }),
  setMemoryPanelOpen: (memoryPanelOpen) => set({ memoryPanelOpen }),
}));

export const aiConfigured = (s: { model: string; serverConfigured?: boolean }): boolean =>
  Boolean(s.model.trim() && s.serverConfigured !== false);
