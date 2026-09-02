import type { NavigateFunction } from 'react-router-dom';

let navigateApp: NavigateFunction | null = null;

/** Bridge React Router navigation to non-React services such as the AI agent. */
export function registerAppNavigation(navigate: NavigateFunction): () => void {
  navigateApp = navigate;
  return () => {
    if (navigateApp === navigate) navigateApp = null;
  };
}

export function navigateAppRoute(to: string): boolean {
  if (!navigateApp) return false;
  navigateApp(to);
  return true;
}
