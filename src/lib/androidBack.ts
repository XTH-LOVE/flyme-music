import { isTauri } from '@/lib/apiTransport';

/**
 * On Android the system back gesture arrives as a window close request.
 * Default behaviour would exit the app; instead walk the router history and
 * only let the app close when there is nowhere left to go back to.
 */
export async function mountAndroidBackNavigation(): Promise<() => void> {
  if (!isTauri() || !/Android/i.test(navigator.userAgent)) return () => undefined;
  const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const win = getCurrentWebviewWindow();
  const unlisten = await win.onCloseRequested(async (event) => {
    // react-router keeps a navigation depth in history.state.idx.
    const depth = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (depth > 0) {
      event.preventDefault();
      window.history.back();
    }
    // depth === 0: fall through and let the app close (or hide to tray).
  });
  return unlisten;
}
