import type { MusicTrack } from '@/music/source/types';
import { downloadTrack, type DownloadProgress } from './download';
import { isMeteredConnection } from '@/audio/analysis/background';

export type DownloadTaskStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
export interface DownloadTask {
  id: string;
  track: MusicTrack;
  status: DownloadTaskStatus;
  error?: string;
  createdAt: number;
  completedAt?: number;
  progress?: number;
  bytesReceived?: number;
  bytesTotal?: number;
}

export interface DownloadQueueSummary {
  total: number;
  queued: number;
  downloading: number;
  completed: number;
  failed: number;
  cancelled: number;
  retryable: number;
}

type Listener = (tasks: DownloadTask[]) => void;
const tasks: DownloadTask[] = [];
const listeners = new Set<Listener>();
let running = false;
const controllers = new Map<string, AbortController>();
const STORAGE_KEY = 'aurora.download.queue.v1';

function restore(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as DownloadTask[];
    if (!Array.isArray(saved)) return;
    tasks.push(
      ...saved
        .filter((task) => task && task.track && typeof task.id === 'string')
        .map((task) => ({
          ...task,
          // A process restart cannot resume a fetch that was in-flight.
          status: task.status === 'downloading' ? 'queued' : task.status,
        })),
    );
  } catch {
    /* ignore corrupted queue state */
  }
}

function persist(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks.slice(-100)));
  } catch {
    /* private mode or a full quota must not break downloads */
  }
}

function emit(): void {
  persist();
  listeners.forEach((listener) => listener(tasks.map((task) => ({ ...task }))));
}
function taskId(track: MusicTrack): string { return track.source + ':' + track.url_id; }
restore();

async function drain(explicit = false): Promise<void> {
  if (running) return;
  if (!explicit && isMeteredConnection()) return;
  running = true;
  try {
    while (true) {
      const task = tasks.find((item) => item.status === 'queued');
      if (!task) break;
      task.status = 'downloading';
      const controller = new AbortController();
      controllers.set(task.id, controller);
      emit();
      try {
        await downloadTrack(task.track, {
          signal: controller.signal,
          onProgress: (progress: DownloadProgress) => {
            task.bytesReceived = progress.received;
            task.bytesTotal = progress.total;
            task.progress = progress.total && progress.total > 0
              ? Math.min(1, progress.received / progress.total)
              : undefined;
            emit();
          },
        });
        task.progress = 1;
        task.status = 'completed'; task.completedAt = Date.now();
      } catch (error) {
        task.status = controller.signal.aborted ? 'cancelled' : 'failed';
        task.error = controller.signal.aborted ? '已取消' : error instanceof Error ? error.message : String(error);
      } finally {
        controllers.delete(task.id);
      }
      emit();
    }
  } finally { running = false; }
}

export function enqueueDownload(track: MusicTrack): DownloadTask {
  const existing = tasks.find((task) => task.id === taskId(track) && (task.status === 'queued' || task.status === 'downloading'));
  if (existing) return existing;
  const task: DownloadTask = { id: taskId(track), track, status: 'queued', createdAt: Date.now() };
  tasks.push(task); emit(); void drain(true); return task;
}
export function retryDownload(id: string): void {
  const task = tasks.find((item) => item.id === id);
  if (task && (task.status === 'failed' || task.status === 'cancelled')) {
    task.status = 'queued';
    task.error = undefined;
    emit();
    void drain(true);
  }
}
export function cancelDownload(id: string): void {
  const task = tasks.find((item) => item.id === id);
  if (task?.status === 'queued') { task.status = 'cancelled'; emit(); }
  else if (task?.status === 'downloading') {
    controllers.get(id)?.abort();
  }
}
export function clearFinishedDownloads(): void {
  for (let i = tasks.length - 1; i >= 0; i -= 1) if (tasks[i].status === 'completed' || tasks[i].status === 'cancelled') tasks.splice(i, 1);
  emit();
}
export function getDownloadTasks(): DownloadTask[] { return tasks.map((task) => ({ ...task })); }
export function subscribeDownloads(listener: Listener): () => void { listeners.add(listener); listener(getDownloadTasks()); return () => listeners.delete(listener); }

export function getDownloadQueueSummary(): DownloadQueueSummary {
  const summary: DownloadQueueSummary = {
    total: tasks.length,
    queued: 0,
    downloading: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    retryable: 0,
  };
  for (const task of tasks) {
    summary[task.status] += 1;
    if (task.status === 'failed' || task.status === 'cancelled') summary.retryable += 1;
  }
  return summary;
}

if (typeof window !== 'undefined') {
  // A restored queue waits on metered data, then resumes when connectivity
  // changes back to an unmetered/online state.
  window.addEventListener('online', () => void drain());
  const connection = (navigator as Navigator & {
    connection?: EventTarget;
  }).connection;
  connection?.addEventListener('change', () => void drain());
  void drain();
}
