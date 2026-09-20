import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  /** Resolved value actually applied to the DOM. */
  resolved: 'light' | 'dark';
  /** OLED pure-black surfaces while in dark mode. */
  pureBlack: boolean;
  setMode: (mode: ThemeMode) => void;
  setPureBlack: (v: boolean) => void;
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(resolved: 'light' | 'dark', pureBlack: boolean): void {
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.setAttribute('data-black', resolved === 'dark' && pureBlack ? '1' : '0');
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

function loadPureBlack(): boolean {
  try {
    return localStorage.getItem('aurora.theme.black') === '1';
  } catch {
    return false;
  }
}

const initialMode = loadMode();
const initialBlack = loadPureBlack();
const initialResolved =
  initialMode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : initialMode;
applyTheme(initialResolved, initialBlack);

// Track OS-level changes while in system mode.
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', (e) => {
    const state = useThemeStore.getState();
    if (state.mode === 'system') {
      const resolved = e.matches ? 'dark' : 'light';
      applyTheme(resolved, state.pureBlack);
      useThemeStore.setState({ resolved });
    }
  });

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initialMode,
  resolved: initialResolved,
  pureBlack: initialBlack,
  setMode: (mode) => {
    const resolved = mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
    applyTheme(resolved, useThemeStore.getState().pureBlack);
    try {
      localStorage.setItem('aurora.theme', mode);
    } catch {
      /* ignore */
    }
    set({ mode, resolved });
  },
  setPureBlack: (pureBlack) => {
    applyTheme(useThemeStore.getState().resolved, pureBlack);
    try {
      localStorage.setItem('aurora.theme.black', pureBlack ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ pureBlack });
  },
}));
