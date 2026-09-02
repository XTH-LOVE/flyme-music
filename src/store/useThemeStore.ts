import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  /** Resolved value actually applied to the DOM. */
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(resolved: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', resolved);
}

function loadMode(): ThemeMode {
  try {
    const saved = localStorage.getItem('aurora.theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    /* ignore */
  }
  return 'system';
}

const initialMode = loadMode();
const initialResolved =
  initialMode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : initialMode;
applyTheme(initialResolved);

// Track OS-level changes while in system mode.
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', (e) => {
    const state = useThemeStore.getState();
    if (state.mode === 'system') {
      const resolved = e.matches ? 'dark' : 'light';
      applyTheme(resolved);
      useThemeStore.setState({ resolved });
    }
  });

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initialMode,
  resolved: initialResolved,
  setMode: (mode) => {
    const resolved = mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
    applyTheme(resolved);
    try {
      localStorage.setItem('aurora.theme', mode);
    } catch {
      /* ignore */
    }
    set({ mode, resolved });
  },
}));
