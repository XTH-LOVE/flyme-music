/**
 * Pure guest-side sync planner for listen rooms. Given the remote room state
 * and the local player state, decide the minimal playback command needed to
 * follow the host. Kept pure so drift/clock-skew rules are unit-testable.
 */

export interface RemoteRoomState {
  trackKey: string | null;
  queueIndex: number;
  positionSeconds: number;
  isPlaying: boolean;
  /** Host's updated_at in ms since epoch. */
  updatedAt: number;
}

export interface LocalPlayerState {
  trackKey: string | null;
  position: number;
  isPlaying: boolean;
}

export type SyncCommand =
  | { kind: 'switch'; queueIndex: number; seekTo: number }
  | { kind: 'toggle' }
  | { kind: 'seek'; seekTo: number }
  | { kind: 'none' };

/** Position drift beyond this many seconds triggers a hard re-seek. */
const DRIFT_TOLERANCE_S = 3;

export function planGuestSync(
  local: LocalPlayerState,
  remote: RemoteRoomState,
  now: number,
): SyncCommand {
  // Trust the host clock minus transport latency: our Date.now() against
  // their updated_at. Skew beyond a few seconds is rare between people
  // listening together on the same service.
  const elapsed = remote.isPlaying ? Math.max(0, (now - remote.updatedAt) / 1000) : 0;
  const target = Math.max(0, remote.positionSeconds + elapsed);

  if ((remote.trackKey ?? '') !== (local.trackKey ?? '')) {
    return { kind: 'switch', queueIndex: remote.queueIndex, seekTo: target };
  }
  if (Math.abs(local.position - target) > DRIFT_TOLERANCE_S) {
    return { kind: 'seek', seekTo: target };
  }
  if (local.isPlaying !== remote.isPlaying) {
    return { kind: 'toggle' };
  }
  return { kind: 'none' };
}
