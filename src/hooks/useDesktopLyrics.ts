import { useEffect, useState } from 'react';
import { playerController } from '@/player';
import { fetchLyricLines, lyricLineAt } from '@/utils/currentLyric';
import { trackKeyOf } from '@/audio/analysis';
import {
  canShowDesktopLyric,
  hideDesktopLyric,
  showDesktopLyric,
  updateDesktopLyric,
} from '@/lib/nativeMedia';

/**
 * Keeps the floating lyric line in step with playback.
 *
 * Off unless the user turns it on, and stored per device rather than synced -
 * it is a property of this phone's screen, not of the account.
 *
 * The permission is checked when it is switched on, and the caller is told when
 * it is missing. Starting the overlay without the grant adds no window and
 * reports nothing, which is indistinguishable from the toggle being broken.
 */
const KEY = 'aurora.desktopLyric';

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function useDesktopLyrics(): {
  enabled: boolean;
  setEnabled: (on: boolean) => boolean;
} {
  const [enabled, setEnabledState] = useState(readEnabled);

  useEffect(() => {
    if (!enabled) return;
    if (!canShowDesktopLyric()) return;

    let alive = true;
    let lines: Awaited<ReturnType<typeof fetchLyricLines>> = [];
    let loadedKey = '';
    let lastText = '';

    const push = (text: string) => {
      // One update per actual change: the snapshot fires several times a
      // second, and a cross-process call each time would be wasteful for a
      // string that changes every few seconds.
      if (text === lastText) return;
      lastText = text;
      updateDesktopLyric(text, false);
    };

    const unsubscribe = playerController.subscribe((snap) => {
      const track = snap.current;
      if (!track) {
        push('');
        return;
      }
      const key = trackKeyOf(track);
      if (key !== loadedKey) {
        loadedKey = key;
        lines = [];
        void fetchLyricLines(track).then((result) => {
          if (alive && key === loadedKey) lines = result;
        });
        return;
      }
      push(lyricLineAt(lines, snap.currentTime)?.text ?? '');
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [enabled]);

  return {
    enabled,
    setEnabled: (on: boolean) => {
      if (on && !canShowDesktopLyric()) {
        // Reported rather than swallowed: the caller shows the way to grant it.
        return false;
      }
      try {
        localStorage.setItem(KEY, on ? '1' : '0');
      } catch {
        /* private mode: the setting simply will not persist */
      }
      setEnabledState(on);
      if (on) showDesktopLyric('', false);
      else hideDesktopLyric();
      return true;
    },
  };
}
