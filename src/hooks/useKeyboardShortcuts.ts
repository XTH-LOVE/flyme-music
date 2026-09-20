import { useEffect } from 'react';
import { playerController } from '@/player';
import { usePlayerStore } from '@/store/usePlayerStore';

/**
 * Desktop keyboard shortcuts:
 *   Space        - play / pause (global; inputs are exempt)
 *   ← / →        - seek ∓5s   (only while the full player is open)
 *   ↑ / ↓        - volume     (only while the full player is open)
 * Arrow keys stay out of the way of normal page scrolling when the player
 * is closed.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        playerController.toggle();
        return;
      }
      if (!usePlayerStore.getState().fullPlayerOpen) return;

      const snap = playerController.snapshot();
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        playerController.seek(Math.min(snap.duration || 0, snap.currentTime + 5));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        playerController.seek(Math.max(0, snap.currentTime - 5));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        playerController.setVolume(Math.min(1, snap.volume + 0.1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        playerController.setVolume(Math.max(0, snap.volume - 0.1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
