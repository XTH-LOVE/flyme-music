import { create } from 'zustand';

export type AudioQuality = 'standard' | 'high' | 'lossless';

interface SettingsState {
  quality: AudioQuality;
  autoplayNext: boolean;
  /** Accent color follows the current cover artwork (opt-in). */
  dynamicAccent: boolean;
  /** Route remote streams through our same-origin proxy so the Web Audio
   *  analyser unlocks the REAL rhythm spectrum. */
  realSpectrum: boolean;
  /**
   * Ambient motion in the player: the breathing cover and the drifting
   * backdrop. Purely decorative, so it is switchable for anyone on slower
   * hardware who would rather have the frames back.
   */
  ambientMotion: boolean;
  /**
   * Index tracks in the background so sound-based similarity and the listening
   * profile have something to work on.
   *
   * This downloads whole tracks, so it is a real bandwidth cost and the user is
   * told so in Settings. On by default because the feature is inert without it,
   * but always skipped on metered or data-saver connections.
   */
  backgroundAnalysis: boolean;
  setQuality: (q: AudioQuality) => void;
  setAutoplayNext: (v: boolean) => void;
  setDynamicAccent: (v: boolean) => void;
  setRealSpectrum: (v: boolean) => void;
  setAmbientMotion: (v: boolean) => void;
  setBackgroundAnalysis: (v: boolean) => void;
}

// v2: bumped so the default quality becomes lossless (highest available);
// the resolver falls back to lower bitrates automatically when unavailable.
const SETTINGS_KEY = 'aurora.settings.v2';

interface PersistedSettings {
  quality?: AudioQuality;
  autoplayNext?: boolean;
  dynamicAccent?: boolean;
  realSpectrum?: boolean;
  ambientMotion?: boolean;
  backgroundAnalysis?: boolean;
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
  dynamicAccent: persisted.dynamicAccent ?? false,
  // Default OFF: routing live audio through the server proxy stutters on
  // flaky routes. Real spectrum still applies to cached/local tracks, and
  // users can opt in from Settings if their network handles the proxy well.
  realSpectrum: persisted.realSpectrum ?? false,
  ambientMotion: persisted.ambientMotion ?? true,
  backgroundAnalysis: persisted.backgroundAnalysis ?? true,
  setBackgroundAnalysis: (backgroundAnalysis) => {
    saveSettings({ backgroundAnalysis });
    set({ backgroundAnalysis });
  },
  setAmbientMotion: (ambientMotion) => {
    saveSettings({ ambientMotion });
    set({ ambientMotion });
  },
  setDynamicAccent: (dynamicAccent) => {
    saveSettings({ dynamicAccent });
    set({ dynamicAccent });
  },
  setRealSpectrum: (realSpectrum) => {
    saveSettings({ realSpectrum });
    set({ realSpectrum });
  },
  setQuality: (quality) => {
    saveSettings({ quality });
    set({ quality });
  },
  setAutoplayNext: (autoplayNext) => {
    saveSettings({ autoplayNext });
    set({ autoplayNext });
  },
}));
