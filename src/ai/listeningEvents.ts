import type { MusicTrack } from '@/music/source/types';

export type ListeningEventType =
  | 'started'
  | 'completed'
  | 'skipped'
  | 'liked'
  | 'disliked'
  | 'repeated'
  | 'manuallyQueued';

export interface ListeningEvent {
  id: string;
  type: ListeningEventType;
  trackKey: string;
  track: MusicTrack;
  at: number;
  positionSec?: number;
  source?: string;
}

const KEY = 'aurora.ai.listening-events.v1';
const MAX_EVENTS = 2000;

export function listeningTrackKey(track: Pick<MusicTrack, 'source' | 'id'>): string {
  return `${track.source}:${track.id}`;
}

function read(): ListeningEvent[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((item): item is ListeningEvent => Boolean(item && typeof item === 'object' && typeof (item as ListeningEvent).trackKey === 'string')) : [];
  } catch {
    return [];
  }
}

function write(events: ListeningEvent[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(events.slice(-MAX_EVENTS))); } catch { /* optional */ }
}

export function loadListeningEvents(): ListeningEvent[] {
  return read().sort((a, b) => b.at - a.at);
}

export function logListeningEvent(
  type: ListeningEventType,
  track: MusicTrack,
  details: { at?: number; positionSec?: number; source?: string } = {},
): ListeningEvent {
  const at = details.at ?? Date.now();
  const event: ListeningEvent = {
    id: `le${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    trackKey: listeningTrackKey(track),
    track: { ...track, artist: [...track.artist] },
    at,
    positionSec: details.positionSec,
    source: details.source,
  };
  const events = read();
  // A subscription can see the same snapshot twice. Collapse only identical
  // events in a short window; repeated songs remain distinct signals.
  const duplicate = events.find((item) => item.type === type && item.trackKey === event.trackKey && at - item.at < 1500);
  if (!duplicate) write([...events, event]);
  return duplicate ?? event;
}

export function clearListeningEvents(): void {
  try { localStorage.removeItem(KEY); } catch { /* optional */ }
}

export function countListeningEvents(type?: ListeningEventType): number {
  return loadListeningEvents().filter((event) => !type || event.type === type).length;
}
