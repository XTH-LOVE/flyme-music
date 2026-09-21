import { useEffect } from 'react';
import { playerController } from '@/player';
import { resolveTrackPic } from '@/music/source/track-resolver';
import type { MusicTrack } from '@/music/source/types';
import { isTauri } from '@/lib/apiTransport';
import {
  clearNativeNowPlaying,
  onNativeMediaAction,
  rememberTrack,
  setNativePlaying,
  updateNativeNowPlaying,
} from '@/lib/nativeMedia';

/**
 * Lockscreen cover, OS media keys and system playback controls via the
 * MediaSession API. Mounted once from AppLayout next to the other global
 * player hooks.
 */

const trackKeyOf = (track: MusicTrack) => track.source + ':' + track.id + ':' + track.url_id;

/** Local tracks have no cover URL - render their palette gradient to a PNG. */
function gradientArtwork(track: MusicTrack): string | null {
  if (!track.palette) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, track.palette[0]);
    gradient.addColorStop(1, track.palette[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

async function artworkFor(track: MusicTrack): Promise<MediaImage[]> {
  const raw =
    track.picUrl ??
    (await resolveTrackPic(track, 256).catch(() => null)) ??
    gradientArtwork(track);
  if (!raw) return [];
  let src: string;
  try {
    src = new URL(raw, window.location.href).toString();
  } catch {
    return [];
  }
  return [{ src, sizes: '256x256', type: src.startsWith('data:') ? 'image/png' : 'image/jpeg' }];
}

export function useMediaSession(): void {
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const media = navigator.mediaSession;

    // 'play'/'pause' only fire in the matching OS state, so toggle() is exact.
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => playerController.toggle()],
      ['pause', () => playerController.toggle()],
      ['previoustrack', () => playerController.previous()],
      ['nexttrack', () => playerController.next()],
      [
        'seekbackward',
        (details) =>
          playerController.seek(
            Math.max(0, playerController.snapshot().currentTime - (details?.seekOffset ?? 10)),
          ),
      ],
      [
        'seekforward',
        (details) =>
          playerController.seek(
            playerController.snapshot().currentTime + (details?.seekOffset ?? 10),
          ),
      ],
      [
        'seekto',
        (details) => {
          // lib.dom here lacks MediaSessionSeekToActionDetails; shape-narrow instead.
          const time = (details as { seekTime?: number } | undefined)?.seekTime;
          if (typeof time === 'number') playerController.seek(time);
        },
      ],
    ];
    for (const [action, handler] of handlers) {
      try {
        media.setActionHandler(action, handler);
      } catch {
        /* action not supported on this engine */
      }
    }

    let lastKey = '';
    let lastPositionPush = 0;
    const unsub = playerController.subscribe((snap) => {
      media.playbackState = snap.status === 'playing' ? 'playing' : 'paused';

      const key = snap.current ? trackKeyOf(snap.current) : '';
      if (snap.current && key !== lastKey) {
        const track = snap.current;
        lastKey = key;
        void artworkFor(track).then((artwork) => {
          // Artwork resolution is async; only apply it if the track is still current.
          const current = playerController.snapshot().current;
          if (!current || trackKeyOf(current) !== key) return;
          try {
            media.metadata = new MediaMetadata({
              title: track.name,
              artist: track.artist.join(' / '),
                artwork,
            });
          } catch {
            /* engines without MediaMetadata constructor */
          }
        });
      } else if (!snap.current && lastKey) {
        lastKey = '';
        media.metadata = null;
      }

      // The OS interpolates position between pushes using playbackRate, so a
      // 2s cadence keeps the lockscreen progress bar honest even at 3x speed.
      if (
        snap.status === 'playing' &&
        Number.isFinite(snap.duration) &&
        snap.duration > 0 &&
        typeof media.setPositionState === 'function'
      ) {
        const now = Date.now();
        if (now - lastPositionPush >= 2000) {
          lastPositionPush = now;
          try {
            media.setPositionState({
              duration: snap.duration,
              position: Math.min(Math.max(0, snap.currentTime), snap.duration),
              playbackRate: snap.speed,
            });
          } catch {
            /* invalid state values on some engines */
          }
        }
      }
    });

    return () => {
      unsub();
      for (const [action] of handlers) {
        try {
          media.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
      media.metadata = null;
      media.playbackState = 'none';
    };
  }, []);

  /**
   * The Android notification, kept as its own effect.
   *
   * It must not sit inside the one above: that effect returns early when
   * `navigator.mediaSession` is missing, and a Tauri WebView does not
   * necessarily expose it - which is the whole reason the native path exists.
   * Nesting it there would disable the fallback exactly when it is needed.
   */
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;

    void onNativeMediaAction((action) => {
      // Routed to the same controller the web path uses, so there is still one
      // player making the decisions.
      switch (action) {
        case 'play':
        case 'pause':
          playerController.toggle();
          break;
        case 'next':
          playerController.next();
          break;
        case 'previous':
          playerController.previous();
          break;
        case 'stop':
          playerController.pause();
          break;
      }
    });

    let lastKey = '';
    const unsub = playerController.subscribe((snap) => {
      const track = snap.current;
      const key = track ? trackKeyOf(track) : '';

      if (track && key !== lastKey) {
        lastKey = key;
        void artworkFor(track).then((artwork) => {
          if (!alive) return;
          // Artwork resolution is async; a stale result must not overwrite a
          // track the user has already moved past.
          const current = playerController.snapshot().current;
          if (!current || trackKeyOf(current) !== key) return;
          rememberTrack(track.name, track.artist.join(' / '));
          void updateNativeNowPlaying({
            title: track.name,
            artist: track.artist.join(' / '),
            // Seconds, matching the bridge and the web API above - one unit
            // everywhere, so there is no conversion to get wrong.
            duration: Number.isFinite(snap.duration) ? snap.duration : 0,
            position: Number.isFinite(snap.currentTime) ? snap.currentTime : 0,
            cover: artwork[0]?.src,
            playing: snap.status === 'playing',
          });
        });
        return;
      }

      if (!track) {
        if (lastKey) {
          lastKey = '';
          void clearNativeNowPlaying();
        }
        return;
      }

      // Same track: only the play state can have changed, so the metadata and
      // the cover fetch are skipped.
      void setNativePlaying(snap.status === 'playing', snap.currentTime, snap.duration);
    });

    return () => {
      alive = false;
      unsub();
      void clearNativeNowPlaying();
    };
  }, []);
}
