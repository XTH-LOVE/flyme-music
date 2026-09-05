import { create } from 'zustand';

export type AudioQuality = 'standard' | 'high' | 'lossless';

interface SettingsState {
  quality: AudioQuality;
  autoplayNext: boolean;
  setQuality: (q: AudioQuality) => void;
  setAutoplayNext: (v: boolean) => void;
}

// v2: bumped so the default quality becomes lossless (highest available);
// the resolver falls back to lower bitrates automatically when unavailable.
const SETTINGS_KEY = 'aurora.settings.v2';

interface PersistedSettings {
  quality?: AudioQuality;
  autoplayNext?: boolean;
}

function loadSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as PersistedSettings) : {};
  } catch {
    return {};
  }
}

function saveSettings(patch: Partial<SettingsState>): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...loadSettings(), ...patch }));
  } catch {
    /* ignore */
  }
}

const persisted = loadSettings();

export const useSettingsStore = create<SettingsState>((set) => ({
  quality: persisted.quality ?? 'lossless',
  autoplayNext: persisted.autoplayNext ?? true,
  setQuality: (quality) => {
    saveSettings({ quality });
    set({ quality });
  },
  setAutoplayNext: (autoplayNext) => {
    saveSettings({ autoplayNext });
    set({ autoplayNext });
  },
}));
