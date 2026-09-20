import { playerController } from '@/player';
import { isTauri } from './apiTransport';

/**
 * Maps the Rust-side global media shortcuts (tray/app registered:
 * Ctrl/Cmd+Alt+Arrow keys and Space) onto the player controller. No-op
 * outside the packaged app.
 */
export async function mountGlobalMediaKeys(): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<string>('am-media', (event) => {
    switch (event.payload) {
      case 'next':
        playerController.next();
        break;
      case 'previous':
        playerController.previous();
        break;
      case 'toggle':
        playerController.toggle();
        break;
      default:
        break;
    }
  });
  return unlisten;
}
