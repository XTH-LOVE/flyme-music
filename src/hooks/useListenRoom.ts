import { useEffect } from 'react';
import { playerController } from '@/player';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useListenStore, myListenId } from '@/store/useListenStore';
import {
  broadcastRoomState,
  closeRoom,
  leaveRoomAsGuest,
  subscribeRoom,
  type RoomStatePatch,
} from '@/listen/listenRoom';
import { planGuestSync } from '@/listen/sync';
import type { MusicTrack } from '@/music/source/types';

const trackKeyOf = (t: MusicTrack | null) => (t ? t.source + ':' + t.id : '');

const POSITION_PUSH_MS = 3000;

/**
 * Headless listen-room bridge, mounted once from AppLayout. The host mirrors
 * player snapshots into the room row; the guest plans minimal sync commands
 * from realtime updates. Guest transport controls stay host-driven by design.
 */
export function useListenRoom(): void {
  useEffect(() => {
    const state = useListenStore.getState();
    if (state.status !== 'active' || !state.roomId || !state.role) return undefined;
    const roomId = state.roomId;
    const role = state.role;

    let lastKey = trackKeyOf(usePlayerStore.getState().current);
    let lastPlaying = usePlayerStore.getState().status === 'playing';
    let lastPush = 0;
    let syncing = false;

    const unsubscribePlayer =
      role === 'host'
        ? playerController.subscribe((snap) => {
            const key = trackKeyOf(snap.current);
            const playing = snap.status === 'playing';
            const now = Date.now();
            const trackChanged = key !== lastKey;
            const playChanged = playing !== lastPlaying;
            if (!trackChanged && !playChanged && now - lastPush < POSITION_PUSH_MS) return;
            lastKey = key;
            lastPlaying = playing;
            lastPush = now;
            const patch: RoomStatePatch = {
              current_track: snap.current,
              queue: snap.queue,
              queue_index: snap.queueIndex,
              position_seconds: snap.currentTime,
              is_playing: playing,
            };
            void broadcastRoomState(roomId, patch).catch(() => undefined);
          })
        : null;

    // Guest: follow realtime row updates (host snapshot writes).
    const unsubscribeRoom = subscribeRoom(roomId, (row) => {
      if (role !== 'guest' || syncing || row.updated_by === myListenId()) return;
      const local = usePlayerStore.getState();
      const command = planGuestSync(
        { trackKey: trackKeyOf(local.current), position: local.currentTime, isPlaying: local.status === 'playing' },
        {
          trackKey: row.current_track ? row.current_track.source + ':' + row.current_track.id : null,
          queueIndex: row.queue_index ?? 0,
          positionSeconds: Number(row.position_seconds) || 0,
          isPlaying: row.is_playing,
          updatedAt: Date.parse(row.updated_at) || Date.now(),
        },
        Date.now(),
      );
      if (command.kind === 'none') return;
      syncing = true;
      try {
        if (command.kind === 'switch') {
          const queue = (row.queue ?? []) as MusicTrack[];
          if (queue.length) {
            playerController.playTracks(queue, Math.min(Math.max(0, command.queueIndex), queue.length - 1));
          } else if (row.current_track) {
            playerController.playTrack(row.current_track);
          }
          // seek() marks the controller's userSeeked flag, so the mid-flight
          // stream attach resumes at the synced position instead of restarting.
          if (command.seekTo > 0) playerController.seek(command.seekTo);
        } else if (command.kind === 'seek') {
          playerController.seek(command.seekTo);
        } else if (command.kind === 'toggle') {
          playerController.toggle();
        }
      } finally {
        syncing = false;
      }
    });

    return () => {
      unsubscribePlayer?.();
      unsubscribeRoom();
    };
  }, [useListenStore((s) => s.status), useListenStore((s) => s.roomId), useListenStore((s) => s.role)]);
}

/** Leave/close the current room and clear the store. */
export async function leaveListenRoom(): Promise<void> {
  const state = useListenStore.getState();
  if (state.roomId && state.role === 'host') {
    await closeRoom(state.roomId).catch(() => undefined);
  } else if (state.roomId && state.role === 'guest') {
    await leaveRoomAsGuest(state.roomId).catch(() => undefined);
  }
  useListenStore.getState().reset();
}

/** Create a room as host (must be logged in). */
export async function hostListenRoom(): Promise<void> {
  const listen = useListenStore.getState();
  const user = useAuthStore.getState().user;
  if (!user) {
    listen.fail('请先在「我的」页面登录 Aurora 账号');
    return;
  }
  listen.begin('host');
  try {
    const { createRoom } = await import('@/listen/listenRoom');
    const row = await createRoom({ nickname: user.nickname, avatarUrl: user.avatarUrl });
    useListenStore.getState().activate(row, 'host', user.id);
  } catch (e) {
    listen.fail(e instanceof Error ? e.message : '创建房间失败');
  }
}

/** Join an existing room by its 6-character code. */
export async function joinListenRoom(code: string): Promise<void> {
  const listen = useListenStore.getState();
  const user = useAuthStore.getState().user;
  if (!user) {
    listen.fail('请先在「我的」页面登录 Aurora 账号');
    return;
  }
  listen.begin('guest');
  try {
    const { joinRoom } = await import('@/listen/listenRoom');
    const row = await joinRoom(code, { nickname: user.nickname, avatarUrl: user.avatarUrl });
    useListenStore.getState().activate(row, 'guest', user.id);
  } catch (e) {
    listen.fail(e instanceof Error ? e.message : '加入房间失败');
  }
}
