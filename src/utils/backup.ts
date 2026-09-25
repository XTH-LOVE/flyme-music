import type { MusicTrack } from '@/music/source/types';
import type { UserPlaylist } from '@/store/usePlaylistStore';
import type { PlayLogEntry } from '@/store/useLibraryStore';
import { saveFile } from '@/utils/saveBlob';

/**
 * Local data backup/restore — favorites, recent tracks, play log, dislikes
 * and user playlists all live in localStorage and are lost on a new device or
 * a cleared browser. This module serializes them to a versioned JSON file and
 * rehydrates them on import.
 */

export const BACKUP_VERSION = 1;

/** Marker written into every new backup file. */
export const BACKUP_APP = 'flyme-music';
/**
 * Marker written by the Aurora-era builds, still accepted on import.
 *
 * The product has been called both names, so a backup file in the wild may
 * carry either marker. Both are accepted and normalised to the current one, so
 * an export from either era keeps importing. Never drop one of these without
 * checking that nobody still has a file carrying it.
 */
const LEGACY_BACKUP_APP = 'aurora-music';

export interface FlymeBackup {
  app: typeof BACKUP_APP;
  schema: number;
  exportedAt: number;
  favorites: string[];
  recentTracks: MusicTrack[];
  playLog: PlayLogEntry[];
  dislikes: string[];
  playlists: UserPlaylist[];
}

export interface BackupPayload {
  favorites?: string[];
  recentTracks?: MusicTrack[];
  playLog?: PlayLogEntry[];
  dislikes?: string[];
  playlists?: UserPlaylist[];
}

export function buildBackup(payload: BackupPayload): FlymeBackup {
  return {
    app: BACKUP_APP,
    schema: BACKUP_VERSION,
    exportedAt: Date.now(),
    favorites: payload.favorites ?? [],
    recentTracks: payload.recentTracks ?? [],
    playLog: payload.playLog ?? [],
    dislikes: payload.dislikes ?? [],
    playlists: payload.playlists ?? [],
  };
}

export function backupFileName(now = new Date()): string {
  const d = now;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    'aurora-backup-' +
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '.json'
  );
}

/** Validate an unknown parsed object into a usable backup (best-effort). */
export function parseBackup(raw: unknown): FlymeBackup | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  // Accept the current marker and the pre-rename legacy marker; normalize to
  // the current one so old exports keep importing after the rebrand.
  if (o.app !== BACKUP_APP && o.app !== LEGACY_BACKUP_APP) return null;
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  return {
    app: BACKUP_APP,
    schema: typeof o.schema === 'number' ? o.schema : 0,
    exportedAt: typeof o.exportedAt === 'number' ? o.exportedAt : Date.now(),
    favorites: arr(o.favorites).map(String),
    recentTracks: arr(o.recentTracks) as MusicTrack[],
    playLog: arr(o.playLog) as PlayLogEntry[],
    dislikes: arr(o.dislikes).map(String),
    playlists: arr(o.playlists) as UserPlaylist[],
  };
}

/** Download the backup as a JSON file (Web Share first, then a[download]). */
export async function exportBackup(payload: BackupPayload): Promise<void> {
  const backup = buildBackup(payload);
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  await saveFile(blob, backupFileName());
}

/**
 * The localStorage keys each store reads at startup. Restoring writes these
 * canonical keys so the stores pick them up on the next reload.
 */
const STORAGE_KEYS = {
  favorites: 'aurora.favorites',
  recentTracks: 'aurora.recentTracks.v1',
  playLog: 'aurora.playLog.v1',
  dislikes: 'aurora.ai.dislikes',
  playlists: 'aurora.playlists',
} as const;

/** Write a parsed backup into the canonical localStorage keys (no reload). */
export function restoreBackupToStorage(backup: FlymeBackup): void {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(backup.favorites));
  localStorage.setItem(STORAGE_KEYS.recentTracks, JSON.stringify(backup.recentTracks));
  localStorage.setItem(STORAGE_KEYS.playLog, JSON.stringify(backup.playLog));
  localStorage.setItem(STORAGE_KEYS.dislikes, JSON.stringify(backup.dislikes));
  localStorage.setItem(STORAGE_KEYS.playlists, JSON.stringify(backup.playlists));
}

/** Read a JSON backup file selected by the user. */
export function readBackupFile(file: File): Promise<FlymeBackup | null> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        resolve(parseBackup(parsed));
      } catch {
        reject(new Error('文件不是有效的备份 JSON'));
      }
    };
    reader.readAsText(file);
  });
}
